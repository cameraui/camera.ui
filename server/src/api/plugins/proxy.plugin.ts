import fp from 'fastify-plugin';
import { WebSocket, WebSocketServer } from 'ws';

import { inject, provide, tryInject } from '../../container.js';
import { createSourceName } from '../../utils/camera.js';
import { AuthService } from '../services/auth.service.js';
import { UsersService } from '../services/users.service.js';
import { Go2rtcSender } from './go2rtcSender.js';
import { NatsSubFirewall } from './natsSubFirewall.js';
import { FrameDeflater, isRemoteClient, wantsFrameDeflate, worthCompressing } from './relayCompression.js';

import type { FastifyInstance, FastifyPluginAsync, HookHandlerDoneFunction } from 'fastify';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { ClientOptions, RawData } from 'ws';
import type { TurnRelay } from '../../remote/turnRelay.js';
import type { ProxyServer } from '../../rpc/index.js';
import type { AuthConfig } from '../../rpc/interfaces/config.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { Database } from '../database/index.js';
import type { DBToken } from '../types/index.js';
import type { Go2rtcMessage } from './go2rtcSender.js';

export interface ProxyTLSOptions {
  cert: string | Buffer;
  key: string | Buffer;
  ca: string | Buffer;
  rejectUnauthorized?: boolean;
}

export interface ProxyOptions {
  upstream: string;
  prefix: string;
  target: 'nats' | 'go2rtc';
  tls?: ProxyTLSOptions;
}

type Refusal = readonly [code: number, reason: string];

interface Relay {
  tokenId: string;
  userId: string;
  target: ProxyOptions['target'];
  privileged: boolean;
  upstream: WebSocket;
  client?: WebSocket;
  ended?: Refusal;
  endsAt?: number;
}

const GO2RTC_VIEWER_MESSAGES = new Set(['mse', 'mse/stop', 'mp4', 'hls', 'mjpeg', 'webcodecs', 'webrtc/offer', 'webrtc/candidate', 'talkback']);

const HEARTBEAT_MS = 30_000;
// 60 to 90 s of silence, above the 45 s after which the browser drops a silent connection itself
const DEAD_AFTER_PINGS = 2;

const MIB = 1024 * 1024;
// above max_payload (4 MiB), a single scrub or snapshot reply never pauses the upstream
const NATS_PAUSE_ABOVE = 8 * MIB;
// about 1 MiB drained, nats-server cuts an upstream whose pending write stalls for 10 s
const NATS_RESUME_BELOW = 7 * MIB;
// a writev reports nothing until all of it is out, the rest waits in the relay queue
const IN_FLIGHT = 512 * 1024;
// a write callback costs a closure and a tick, a smaller frame into an idle socket skips it
const UNTRACKED_FRAME_MAX = 64 * 1024;
const NATS_MAX_BUFFERED = 32 * MIB;
// a client frame is about one message of at most max_payload, this bounds its inflated size
const NATS_MAX_CLIENT_FRAME = 16 * MIB;
// nats.swift refuses frames above 8 MB
const NATS_FRAME_CAP = 4 * MIB;
// a 10 s GOP replay of a 16 Mbit stream is about 20 MB
const GO2RTC_MAX_BUFFERED = 32 * MIB;
const GO2RTC_BEHIND_ABOVE = 2 * MIB;
const GO2RTC_MAX_BEHIND_MS = 5_000;
// a link with little headroom drains go2rtc's GOP replay for several seconds
const GO2RTC_REPLAY_SETTLE_MS = 10_000;
const GO2RTC_REPLAY_REPLIES = new Set(['mse', 'webcodecs']);
const GO2RTC_APP_PING = '{"type":"ping"}';
const GO2RTC_APP_PONG = '{"type":"pong"}';
const APP_PING_MAX_BYTES = 64;
const UPSTREAM_HANDSHAKE_TIMEOUT_MS = 10_000;
// nothing is queued on a refusal, no need to wait the 30 s default
const REFUSAL_CLOSE_TIMEOUT_MS = 2_000;
// Home Assistant's proxies may hand the close right behind the notice, nats.js then drops it
const REFUSAL_NOTICE_LEAD_MS = 50;
const DIAL_WARNING_INTERVAL_MS = 30_000;
const MAX_DIAL_WARNING_KEYS = 256;
// nats.js reads an -ERR only after an INFO
const NATS_REFUSAL_INFO = 'INFO {"server_id":"camera.ui-relay","version":"2.10.0","proto":1,"headers":true,"max_payload":1048576}\r\n';

const SHARE_USER_PREFIX = 'share_';
// per target, a reconnecting client leaves its old relay open until the heartbeat drops it
const MAX_RELAYS_PER_TOKEN = 64;
const MAX_RELAYS_PER_SHARE = 50;
// setTimeout fires at once above this
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
const SESSION_REVOKED: Refusal = [4401, 'unauthorized: session revoked'];
const SHARE_ENDED: Refusal = [4401, 'unauthorized: share ended'];
// clients retry a 4429 with backoff, a 4403 or a forbidden reason makes them give up
const TOO_MANY_RELAYS: Refusal = [4429, 'too many connections'];
// clients read a 1008 or a reason that mentions auth as an expired token
const UPSTREAM_REFUSALS: [line: Buffer, refusal: Refusal][] = [
  [Buffer.from("-ERR 'Authorization Violation'"), [4500, 'upstream rejected relay credentials']],
  [Buffer.from("-ERR 'Authentication Timeout'"), [4500, 'upstream timed out waiting for CONNECT']],
];

function isValidCloseCode(code: number): boolean {
  return (code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) || (code >= 3000 && code <= 4999);
}

function upstreamRefusal(frame: Buffer): Refusal | undefined {
  for (const [line, refusal] of UPSTREAM_REFUSALS) {
    if (frame.length >= line.length && frame.compare(line, 0, line.length, 0, line.length) === 0) return refusal;
  }
  return undefined;
}

function bearerToken(header: string | undefined): string {
  const [scheme, token] = header?.split(/\s+/) ?? [];
  return scheme === 'Bearer' && token ? token : '';
}

function addTo<V>(map: Map<string, Set<V>>, key: string, value: V): void {
  const set = map.get(key);
  if (set) set.add(value);
  else map.set(key, new Set([value]));
}

function removeFrom<V>(map: Map<string, Set<V>>, key: string, value: V): void {
  const set = map.get(key);
  if (set?.delete(value) && !set.size) map.delete(key);
}

export class RelayRegistry {
  private byToken = new Map<string, Set<Relay>>();
  private byUser = new Map<string, Set<Relay>>();
  private shareEnds = new Map<string, NodeJS.Timeout>();

  constructor() {
    provide('relayRegistry', this);
  }

  public closeTokens(tokenIds: string[], why: Refusal = SESSION_REVOKED): void {
    for (const tokenId of tokenIds) this.endAll(this.byToken.get(tokenId), why);
  }

  public closeOrphans(userIds: string[], alive: (tokenId: string) => boolean): void {
    for (const userId of userIds) this.endAll(this.byUser.get(userId), SESSION_REVOKED, (relay) => !alive(relay.tokenId));
  }

  public dropAdmin(userId: string): void {
    this.endAll(this.byUser.get(userId), [4401, 'unauthorized: role changed'], (relay) => relay.privileged);
  }

  public terminate(tokenId: string, match: (relay: Relay) => boolean): number {
    let ended = 0;
    for (const relay of [...(this.byToken.get(tokenId) ?? [])]) {
      if (!match(relay)) continue;
      relay.client?.terminate();
      relay.upstream.terminate();
      this.remove(relay);
      ended++;
    }
    return ended;
  }

  public count(by: 'user' | 'token', id: string, match: (relay: Relay) => boolean): number {
    let count = 0;
    for (const relay of (by === 'user' ? this.byUser : this.byToken).get(id) ?? []) {
      if (match(relay)) count++;
    }
    return count;
  }

  public add(relay: Relay): void {
    addTo(this.byToken, relay.tokenId, relay);
    addTo(this.byUser, relay.userId, relay);
    if (relay.endsAt !== undefined && !this.shareEnds.has(relay.userId)) this.endShareAt(relay.userId, relay.endsAt);
  }

  public remove(relay: Relay): void {
    removeFrom(this.byToken, relay.tokenId, relay);
    removeFrom(this.byUser, relay.userId, relay);
    if (!this.byUser.has(relay.userId) && this.shareEnds.has(relay.userId)) {
      clearTimeout(this.shareEnds.get(relay.userId));
      this.shareEnds.delete(relay.userId);
    }
  }

  private endAll(relays: Set<Relay> | undefined, why: Refusal, match?: (relay: Relay) => boolean): void {
    if (!relays) return;
    for (const relay of [...relays]) {
      if (match && !match(relay)) continue;
      if (!relay.client) relay.ended = why;
      else if (relay.client.readyState === WebSocket.OPEN) relay.client.close(...why);
      relay.upstream.terminate();
    }
  }

  private endShareAt(userId: string, at: number): void {
    const timer = setTimeout(
      () => {
        this.shareEnds.delete(userId);
        if (Date.now() < at) this.endShareAt(userId, at);
        else this.endShare(userId);
      },
      Math.min(Math.max(at - Date.now(), 0), MAX_TIMEOUT_MS),
    );
    timer.unref();
    this.shareEnds.set(userId, timer);
  }

  private endShare(userId: string): void {
    this.endAll(this.byUser.get(userId), SHARE_ENDED);
    // a connected WebRTC peer outlives its relay
    tryInject('go2rtcApi')
      ?.streamsRoute.killConsumersByTag(userId)
      .catch(() => {});
  }
}

class WebSocketProxy {
  private wss: WebSocketServer;
  private wssDeflate?: WebSocketServer;
  private wssRefusal: WebSocketServer;
  private upstream: string;
  private upstreamHost: string;
  private prefix: string;
  private target: 'nats' | 'go2rtc';
  private tlsConfig?: ProxyTLSOptions;
  private authService: AuthService;
  private usersService: UsersService;
  private proxy: ProxyServer;
  private logger: LoggerService;
  private dbs: Database;
  private relays: RelayRegistry;
  private unanswered = new WeakMap<WebSocket, number>();
  private appPinged = new WeakSet<WebSocket>();
  private dialWarnings = new Map<string, { at: number; suppressed: number }>();
  private heartbeat: NodeJS.Timeout;

  constructor(fastify: FastifyInstance, options: ProxyOptions) {
    this.proxy = inject('proxy');
    this.logger = inject('logger');
    this.dbs = inject('dbs');
    this.authService = new AuthService();
    this.usersService = new UsersService();
    this.relays = tryInject('relayRegistry') ?? new RelayRegistry();

    this.upstream = options.upstream;
    this.upstreamHost = new URL(options.upstream).host;
    this.prefix = options.prefix;
    this.target = options.target;
    this.tlsConfig = options.tls;

    this.wss = new WebSocketServer({
      noServer: true,
      perMessageDeflate: false,
    });

    // video does not compress; context takeover stays on, without it small replies stop compressing
    if (this.target === 'nats') {
      this.wssDeflate = new WebSocketServer({
        noServer: true,
        maxPayload: NATS_MAX_CLIENT_FRAME,
        perMessageDeflate: { zlibDeflateOptions: { level: 1, chunkSize: 64 * 1024 } },
      });
    }

    // passed as a variable: @types/ws does not know closeTimeout yet
    const refusalOptions = { noServer: true, perMessageDeflate: false, clientTracking: false, closeTimeout: REFUSAL_CLOSE_TIMEOUT_MS };
    this.wssRefusal = new WebSocketServer(refusalOptions);

    this.heartbeat = setInterval(() => this.checkClients(), HEARTBEAT_MS).unref();

    fastify.server.on('upgrade', async (request, socket, head) => {
      if (request.url?.startsWith(this.prefix)) {
        await this.handleUpgrade(request, socket, head);
      }
    });
  }

  public close(): void {
    clearInterval(this.heartbeat);
    this.wss.removeAllListeners();
    this.wss.close();
    this.wssDeflate?.removeAllListeners();
    this.wssDeflate?.close();
    this.wssRefusal.removeAllListeners();
    this.wssRefusal.close();
  }

  private async handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    try {
      const url = new URL(request.url!, `http://${request.headers.host}`);
      const token = url.searchParams.get('token') ?? bearerToken(request.headers.authorization);

      const resolved = this.authService.resolveAccessToken(token);
      if (!resolved) {
        this.reject(request, socket, head, 4401, 'unauthorized: unknown token', token);
        return;
      }

      const dbToken = resolved.token;
      if (resolved.via === 'current' && dbToken.type !== 'api' && dbToken.access_token_expires_at !== undefined && dbToken.access_token_expires_at < Date.now()) {
        this.reject(request, socket, head, 4401, 'unauthorized: token expired', token);
        return;
      }

      let targetUrl = this.upstream;
      let natsCreds: AuthConfig = this.proxy.auth.server;
      let firewallConnId: string | null = null;
      let firewallUserId: string | undefined;
      let go2rtcViewer = false;
      let privileged = false;

      if (this.target === 'go2rtc') {
        const src = url.searchParams.get('src') ?? '';
        go2rtcViewer = this.isGo2rtcViewer(dbToken);
        privileged = !go2rtcViewer;
        const denied = this.go2rtcSrcDenial(dbToken, src, go2rtcViewer);
        if (denied) {
          this.reject(request, socket, head, 4403, denied, token);
          return;
        }
        targetUrl += `?src=${encodeURIComponent(src)}`;

        if (dbToken.user_id.startsWith(SHARE_USER_PREFIX)) {
          targetUrl += `&tag=${encodeURIComponent(dbToken.user_id)}`;
        }
      } else if (this.target === 'nats') {
        if (dbToken.stream_scope || dbToken.user_id.startsWith(SHARE_USER_PREFIX)) {
          this.reject(request, socket, head, 4403, 'forbidden: token not allowed on rpc bus', token);
          return;
        }

        const isAdmin = this.isAdmin(dbToken.user_id);
        natsCreds = isAdmin ? this.proxy.auth.server : this.proxy.auth.viewer;
        privileged = isAdmin;

        if (!isAdmin) {
          const connId = url.searchParams.get('connId') ?? '';
          if (!/^[A-Za-z0-9_-]{8,128}$/.test(connId)) {
            this.reject(request, socket, head, 4400, 'bad request: missing or invalid connId', token);
            return;
          }
          firewallConnId = connId;
          firewallUserId = dbToken.user_id;
        }
      }

      let endsAt: number | undefined;
      if (dbToken.user_id.startsWith(SHARE_USER_PREFIX)) {
        const share = this.dbs.sharesDB.get(dbToken.user_id.slice(SHARE_USER_PREFIX.length));
        endsAt = share && !share.revoked ? Date.parse(share.expiresAt) : undefined;
        if (!share || !endsAt || endsAt <= Date.now()) {
          this.reject(request, socket, head, ...SHARE_ENDED, token);
          return;
        }
        if (this.shareSeatsTaken(dbToken) >= Math.min(share.maxViewers || MAX_RELAYS_PER_SHARE, MAX_RELAYS_PER_SHARE)) {
          this.reject(request, socket, head, 4429, 'share full', token);
          return;
        }
        this.relays.closeTokens([dbToken.id], [4403, 'forbidden: replaced by a newer connection']);
      } else if (!this.hasRelaySlot(dbToken.id)) {
        this.reject(request, socket, head, ...TOO_MANY_RELAYS, token);
        return;
      }

      const turnRelay =
        this.target === 'go2rtc' && (isRemoteClient(request) || dbToken.user_id.startsWith(SHARE_USER_PREFIX)) ? tryInject('remoteAccessManager')?.turnRelay : undefined;

      turnRelay?.prefetch();

      const wsOptions: ClientOptions = {
        perMessageDeflate: false,
        handshakeTimeout: UPSTREAM_HANDSHAKE_TIMEOUT_MS,
        // a Mozilla/ user agent makes nats-server cut messages into 4 KB frames
        headers: { host: this.upstreamHost, 'user-agent': 'camera.ui-relay' },
        ca: this.tlsConfig?.ca,
        cert: this.tlsConfig?.cert,
        key: this.tlsConfig?.key,
        rejectUnauthorized: this.tlsConfig?.rejectUnauthorized,
      };

      const serverWs = new WebSocket(targetUrl, wsOptions);
      const relay: Relay = { tokenId: dbToken.id, userId: dbToken.user_id, target: this.target, privileged, upstream: serverWs, endsAt };
      this.relays.add(relay);
      serverWs.once('close', () => {
        if (!relay.client) this.relays.remove(relay);
      });

      // the NATS INFO can arrive with the 101, before the await below resumes
      const early: [RawData, boolean][] = [];
      const hold = (data: RawData, isBinary: boolean): void => {
        early.push([data, isBinary]);
      };
      serverWs.on('message', hold);

      let left = false;
      const leave = (): void => {
        left = true;
        serverWs.terminate();
      };
      socket.once('close', leave);
      socket.once('end', leave);

      try {
        await new Promise<void>((resolve, reject) => {
          serverWs.once('open', resolve);
          serverWs.once('error', reject);
        });
      } catch (err) {
        if (left) socket.destroy();
        else if (relay.ended) this.reject(request, socket, head, ...relay.ended, token);
        else this.upstreamFailed(request, socket, head, err as Error, url.searchParams.get('src') ?? '');
        return;
      } finally {
        socket.off('close', leave);
        socket.off('end', leave);
      }

      if (relay.ended) {
        this.reject(request, socket, head, ...relay.ended, token);
        return;
      }

      let upgraded = false;
      const remote = this.target === 'nats' && isRemoteClient(request);
      const wss = remote && this.wssDeflate ? this.wssDeflate : this.wss;
      wss.handleUpgrade(request, socket, head, (clientWs) => {
        upgraded = true;
        relay.client = clientWs;
        clientWs.once('close', () => this.relays.remove(relay));
        serverWs.off('message', hold);
        const framed = remote && wantsFrameDeflate(request, url) && !clientWs.extensions.includes('permessage-deflate');
        this.proxyWebSockets(clientWs, serverWs, natsCreds, firewallConnId, firewallUserId, go2rtcViewer, turnRelay, early, framed ? new FrameDeflater() : undefined);
      });

      // handleUpgrade calls back synchronously or never, never means the client left
      if (!upgraded) serverWs.terminate();
    } catch (err) {
      this.logger.warn(`Proxy upgrade failed (500) target=${this.target}: ${(err as Error)?.message ?? err}`);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  }

  private proxyWebSockets(
    client: WebSocket,
    server: WebSocket,
    natsCreds: AuthConfig,
    firewallConnId: string | null,
    firewallUserId: string | undefined,
    go2rtcViewer: boolean,
    turnRelay: TurnRelay | undefined,
    early: [RawData, boolean][],
    deflater?: FrameDeflater,
  ): void {
    const seen = (): void => {
      this.unanswered.set(client, 0);
    };
    seen();
    client.on('message', seen);
    // a proxy may answer protocol pings itself, app-level pingers prove themselves with those
    client.on('pong', () => this.appPinged.has(client) || seen());

    const closeUpstream = (code: number, reason?: Buffer): void => {
      if (server.readyState !== WebSocket.OPEN) return;
      // a paused upstream never reads the close reply, ws would wait its 30 s close timeout
      if (server.isPaused) server.terminate();
      else server.close(code, reason);
    };

    if (firewallConnId) {
      const firewall = new NatsSubFirewall(
        firewallConnId,
        {
          forward: (chunk) => {
            if (server.readyState === WebSocket.OPEN) server.send(chunk, { binary: true });
          },
          close: (reason) => {
            this.logger.warn(`RPC firewall closed connection (connId ${firewallConnId}): ${reason}`);
            if (client.readyState === WebSocket.OPEN) client.close(4403, `forbidden: ${reason}`.slice(0, 123));
            closeUpstream(1000);
          },
          rewriteConnect: (connectData) => this.applyNatsCreds(connectData, natsCreds),
        },
        firewallUserId,
      );

      client.on('message', (data) => {
        if (server.readyState !== WebSocket.OPEN) return;
        firewall.push(this.toBuffer(data));
      });
    } else {
      let connectHandled = false;
      const go2rtc = this.target === 'go2rtc' ? new Go2rtcSender(server, turnRelay, this.logger) : undefined;

      client.on('message', (data, isBinary) => {
        if (server.readyState !== WebSocket.OPEN) return;

        if (this.target === 'go2rtc' && !isBinary && this.answerAppPing(client, data)) return;

        if (go2rtcViewer && !isBinary) {
          const message = this.viewerMessage(data);
          if (!message) {
            this.logger.warn('Proxy closed go2rtc viewer connection (4403): message type not allowed');
            server.close(1000);
            client.close(4403, 'forbidden: message type not allowed');
            return;
          }
          go2rtc?.send(message);
          return;
        }

        if (!connectHandled && this.target === 'nats') {
          connectHandled = true;
          try {
            // a client may send its first PING in the same frame
            const frame = this.toBuffer(data);
            const end = frame.indexOf('\r\n');
            const msg = (end < 0 ? frame : frame.subarray(0, end)).toString('utf-8');
            if (msg.startsWith('CONNECT ')) {
              const connectData = this.applyNatsCreds(JSON.parse(msg.slice(8)), natsCreds);
              const connect = Buffer.from(`CONNECT ${JSON.stringify(connectData)}\r\n`);
              server.send(end < 0 ? connect : Buffer.concat([connect, frame.subarray(end + 2)]), { binary: isBinary });
              return;
            }
          } catch {
            // not a parseable CONNECT, forward as-is
          }
        }

        if (go2rtc) go2rtc.forward(data, isBinary);
        else server.send(data, { binary: isBinary });
      });
    }

    client.on('ping', (data) => server.readyState === WebSocket.OPEN && server.ping(data));
    client.on('pong', (data) => server.readyState === WebSocket.OPEN && server.pong(data));

    client.on('close', (code, reason) => closeUpstream(isValidCloseCode(code) ? code : 1000, reason));
    client.on('error', () => closeUpstream(1011));

    const downstream = this.target === 'nats' ? this.natsDownstream(client, server, deflater) : this.go2rtcDownstream(client, server);
    for (const [data, isBinary] of early) downstream(data, isBinary);
    server.on('message', downstream);

    server.on('ping', (data) => client.readyState === WebSocket.OPEN && client.ping(data));
    server.on('pong', (data) => client.readyState === WebSocket.OPEN && client.pong(data));

    server.on('close', (code, reason) => {
      const close = (): void => {
        if (client.readyState !== WebSocket.OPEN) return;
        // an abnormal upstream close must not read as clean, 4500 makes the client retry
        client.close(isValidCloseCode(code) ? code : 4500, isValidCloseCode(code) ? reason : reason?.length ? reason : 'upstream lost');
      };
      if (deflater) deflater.whenDrained(close);
      else close();
    });

    server.on('error', () => {
      if (client.readyState === WebSocket.OPEN) client.close(1011);
    });
  }

  private natsDownstream(client: WebSocket, server: WebSocket, deflater?: FrameDeflater): (data: RawData, isBinary: boolean) => void {
    const deflate = client.extensions.includes('permessage-deflate');
    const queue: [Buffer, boolean][] = [];
    let queued = 0;
    let refusal: Refusal | undefined;
    const inFlight = (): number => client.bufferedAmount + (deflater?.pending ?? 0);

    const send = (data: Buffer, isBinary: boolean): void => {
      if (deflater) deflater.push(data);
      else sendFrame(data, isBinary, deflate && worthCompressing(data));
    };

    const sendFrame = (data: Buffer, isBinary: boolean, compress: boolean): void => {
      if (data.length <= NATS_FRAME_CAP) {
        // deflater frames always need the callback, their pending bytes drop before they leave
        client.send(data, { binary: isBinary, compress }, deflater || data.length >= UNTRACKED_FRAME_MAX || inFlight() ? onSent : undefined);
        return;
      }
      for (let offset = 0; offset < data.length; offset += NATS_FRAME_CAP) {
        const end = Math.min(offset + NATS_FRAME_CAP, data.length);
        const fin = end === data.length;
        client.send(data.subarray(offset, end), { binary: isBinary, compress, fin }, fin ? onSent : undefined);
      }
    };

    const onSent = (err?: Error): void => {
      if (err || client.readyState !== WebSocket.OPEN) return;
      while (queue.length && inFlight() < IN_FLIGHT) {
        const [data, isBinary] = queue.shift()!;
        queued -= data.length;
        send(data, isBinary);
      }
      if (server.isPaused && queued + inFlight() < NATS_RESUME_BELOW) server.resume();
    };

    if (deflater) {
      deflater.onFrame = (frame) => sendFrame(frame, true, false);
      deflater.onError = (err) => {
        this.logger.warn(`Proxy closed a client whose frame deflate failed target=${this.target}: ${err.message}`);
        client.terminate();
        server.terminate();
      };
    }

    client.once('close', () => {
      queue.length = 0;
      queued = 0;
      deflater?.close();
    });
    // runs before the close handler of proxyWebSockets, so the backlog still precedes the close frame
    server.once('close', () => {
      if (client.readyState === WebSocket.OPEN) {
        const backlog = queued + inFlight();
        if (server.isPaused || backlog >= NATS_PAUSE_ABOVE) {
          this.dropSlowClient(client, server, backlog);
        } else {
          for (const [data, isBinary] of queue) send(data, isBinary);
          const closeWith = refusal;
          if (closeWith) {
            const close = (): void => {
              if (client.readyState === WebSocket.OPEN) client.close(...closeWith);
            };
            if (deflater) deflater.whenDrained(close);
            else close();
          }
        }
      }
      queue.length = 0;
      queued = 0;
    });

    return (raw, isBinary) => {
      if (client.readyState !== WebSocket.OPEN) return;
      const data = this.toBuffer(raw);

      // 0x2d is '-', the close nats-server sends right after a refusal carries it
      if (data[0] === 0x2d) {
        const refused = upstreamRefusal(data);
        if (refused) {
          refusal = refused;
          return;
        }
      }

      const backlog = queued + inFlight();
      if (backlog > NATS_MAX_BUFFERED) {
        this.dropSlowClient(client, server, backlog);
        return;
      }

      if (!server.isPaused && backlog >= NATS_PAUSE_ABOVE) server.pause();

      if (queue.length || inFlight() >= IN_FLIGHT) {
        queue.push([data, isBinary]);
        queued += data.length;
      } else {
        send(data, isBinary);
      }
    };
  }

  private go2rtcDownstream(client: WebSocket, server: WebSocket): (data: RawData, isBinary: boolean) => void {
    let settled = performance.now() + GO2RTC_REPLAY_SETTLE_MS;
    const queue: [Buffer, boolean][] = [];
    let queued = 0;
    let behindSince: number | undefined;
    let behindFrom = 0;

    const onSent = (err?: Error): void => {
      if (err || client.readyState !== WebSocket.OPEN) return;
      while (queue.length && client.bufferedAmount < IN_FLIGHT) {
        const [data, isBinary] = queue.shift()!;
        queued -= data.length;
        client.send(data, { binary: isBinary }, onSent);
      }
    };

    client.once('close', () => {
      queue.length = 0;
      queued = 0;
    });
    // runs before the close handler of proxyWebSockets, so go2rtc's last frames still precede the close frame
    server.once('close', () => {
      if (client.readyState === WebSocket.OPEN) {
        const backlog = queued + client.bufferedAmount;
        if (backlog > GO2RTC_BEHIND_ABOVE) this.dropSlowClient(client, server, backlog);
        else for (const [data, isBinary] of queue) client.send(data, { binary: isBinary });
      }
      queue.length = 0;
      queued = 0;
    });

    return (raw, isBinary) => {
      if (client.readyState !== WebSocket.OPEN) return;
      const data = this.toBuffer(raw);
      if (!isBinary && this.startsGo2rtcReplay(data)) settled = performance.now() + GO2RTC_REPLAY_SETTLE_MS;

      if (queue.length || client.bufferedAmount >= IN_FLIGHT) {
        queue.push([data, isBinary]);
        queued += data.length;
      } else {
        client.send(data, { binary: isBinary }, onSent);
      }

      const backlog = queued + client.bufferedAmount;
      if (backlog > GO2RTC_MAX_BUFFERED) {
        this.dropSlowClient(client, server, backlog);
        return;
      }

      const now = performance.now();
      if (backlog <= GO2RTC_BEHIND_ABOVE || now < settled) {
        behindSince = undefined;
        return;
      }
      if (behindSince !== undefined && now - behindSince <= GO2RTC_MAX_BEHIND_MS) return;

      if (behindSince === undefined || backlog < behindFrom) {
        behindSince = now;
        behindFrom = backlog;
        return;
      }
      this.dropSlowClient(client, server, backlog);
    };
  }

  private dropSlowClient(client: WebSocket, server: WebSocket, buffered: number): void {
    this.logger.warn(`Proxy dropped a client that fell ${(buffered / MIB).toFixed(1)} MB behind target=${this.target}`);
    client.terminate();
    server.terminate();
  }

  private checkClients(): void {
    const clients = this.wssDeflate ? [...this.wss.clients, ...this.wssDeflate.clients] : this.wss.clients;
    for (const client of clients) {
      const unanswered = this.unanswered.get(client);
      if (unanswered === undefined) continue;

      if (unanswered >= DEAD_AFTER_PINGS) {
        this.logger.debug(`Proxy dropped a client that left ${DEAD_AFTER_PINGS} pings unanswered target=${this.target}`);
        client.terminate();
      } else {
        this.unanswered.set(client, unanswered + 1);
        if (client.readyState === WebSocket.OPEN) {
          client.ping();
          if (this.appPinged.has(client)) client.send(GO2RTC_APP_PING);
        }
      }
    }
  }

  private reject(request: IncomingMessage, socket: Duplex, head: Buffer, code: number, reason: string, token: string): void {
    this.logger.warn(`Proxy rejected (${code}) target=${this.target} token=${token.slice(0, 8)}… — ${reason}`);
    this.refuse(request, socket, head, code, reason);
  }

  private upstreamFailed(request: IncomingMessage, socket: Duplex, head: Buffer, err: Error, src: string): void {
    this.warnDialFailure(src, err.message);
    const reason = err.message.includes('timed out') ? 'upstream timeout' : 'upstream unavailable';
    this.refuse(request, socket, head, 4500, reason);
  }

  private refuse(request: IncomingMessage, socket: Duplex, head: Buffer, code: number, reason: string): void {
    const notice = request.headers['x-cui-embed'] ? this.refusalNotice(code, reason) : undefined;
    this.wssRefusal.handleUpgrade(request, socket, head, (clientWs) => {
      clientWs.on('error', () => {});
      if (!notice) {
        clientWs.close(code, reason);
        return;
      }
      clientWs.send(notice);
      setTimeout(() => clientWs.close(code, reason), REFUSAL_NOTICE_LEAD_MS).unref();
    });
  }

  private refusalNotice(code: number, reason: string): string | Buffer | undefined {
    if (this.target === 'go2rtc') return JSON.stringify({ type: 'error', value: reason });
    if (code !== 4401 && code !== 4403) return undefined;
    return Buffer.from(`${NATS_REFUSAL_INFO}-ERR 'Authorization Violation: ${reason}'\r\n`);
  }

  private warnDialFailure(src: string, message: string): void {
    const key = `${src}\n${message}`;
    const now = performance.now();
    const last = this.dialWarnings.get(key);
    if (last && now - last.at < DIAL_WARNING_INTERVAL_MS) {
      last.suppressed++;
      return;
    }

    this.dialWarnings.delete(key);
    if (this.dialWarnings.size >= MAX_DIAL_WARNING_KEYS) this.dialWarnings.delete(this.dialWarnings.keys().next().value!);
    this.dialWarnings.set(key, { at: now, suppressed: 0 });
    const repeated = last?.suppressed ? ` (${last.suppressed} more since the last warning)` : '';
    this.logger.warn(`Proxy upstream dial failed (4500) target=${this.target}: ${message}${repeated}`);
  }

  private isAdmin(userId: string): boolean {
    const role = this.usersService.findById(userId)?.role;
    return role === 'admin' || role === 'master';
  }

  private isGo2rtcViewer(dbToken: DBToken): boolean {
    return Boolean(dbToken.stream_scope) || dbToken.user_id.startsWith(SHARE_USER_PREFIX) || !this.isAdmin(dbToken.user_id);
  }

  private go2rtcSrcDenial(dbToken: DBToken, src: string, viewer: boolean): string | undefined {
    if (dbToken.stream_scope || dbToken.user_id.startsWith(SHARE_USER_PREFIX)) {
      return src && src === dbToken.stream_scope ? undefined : 'forbidden: src out of scope';
    }
    if (!viewer || this.isCameraStream(src)) {
      return undefined;
    }
    return 'forbidden: src is not a camera stream';
  }

  private hasRelaySlot(tokenId: string): boolean {
    const ours = (relay: Relay): boolean => relay.target === this.target;
    if (this.relays.count('token', tokenId, ours) < MAX_RELAYS_PER_TOKEN) return true;

    const silent = (client: WebSocket | undefined): boolean => client !== undefined && (this.unanswered.get(client) ?? 0) >= DEAD_AFTER_PINGS;
    const ended = this.relays.terminate(tokenId, (relay) => ours(relay) && silent(relay.client));
    if (ended) this.logger.debug(`Proxy ended ${ended} relays of a token at its limit that left a ping unanswered target=${this.target}`);
    return this.relays.count('token', tokenId, ours) < MAX_RELAYS_PER_TOKEN;
  }

  private shareSeatsTaken(dbToken: DBToken): number {
    const others = this.relays.count('user', dbToken.user_id, (relay) => relay.tokenId !== dbToken.id);
    return Math.max(others, inject('go2rtcState').countConsumersByTag(dbToken.user_id) - 1);
  }

  private viewerMessage(data: RawData): Go2rtcMessage | undefined {
    let message: { type?: unknown; value?: unknown } | null;
    try {
      message = JSON.parse(this.extractMessage(data));
    } catch {
      return undefined;
    }
    if (typeof message?.type !== 'string' || !GO2RTC_VIEWER_MESSAGES.has(message.type)) {
      return undefined;
    }
    return { type: message.type, value: message.value };
  }

  private startsGo2rtcReplay(data: Buffer): boolean {
    const type = this.go2rtcType(data);
    return typeof type === 'string' && GO2RTC_REPLAY_REPLIES.has(type);
  }

  private answerAppPing(client: WebSocket, data: RawData): boolean {
    const frame = this.toBuffer(data);
    if (frame.length > APP_PING_MAX_BYTES) return false;

    const type = this.go2rtcType(frame);
    if (type === 'ping') {
      this.appPinged.add(client);
      client.send(GO2RTC_APP_PONG);
      return true;
    }
    return type === 'pong';
  }

  private go2rtcType(data: Buffer): unknown {
    try {
      return (JSON.parse(data.toString('utf-8')) as { type?: unknown } | null)?.type;
    } catch {
      return undefined;
    }
  }

  private isCameraStream(src: string): boolean {
    for (const { value: camera } of this.dbs.camerasDB.getRange()) {
      if (camera.sources.some((source) => createSourceName(camera.name, source.name) === src)) {
        return true;
      }
    }
    return false;
  }

  private extractMessage(data: RawData): string {
    if (Buffer.isBuffer(data)) return data.toString('utf-8');
    if (Array.isArray(data)) return Buffer.concat(data).toString('utf-8');
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf-8');
    throw new Error('Unsupported data type');
  }

  private toBuffer(data: RawData): Buffer {
    if (Buffer.isBuffer(data)) return data;
    if (Array.isArray(data)) return Buffer.concat(data);
    return Buffer.from(data);
  }

  private applyNatsCreds(connectData: Record<string, unknown>, natsCreds: AuthConfig): Record<string, unknown> {
    connectData.user = natsCreds.user;
    connectData.pass = natsCreds.password;
    // tls lives in the transport, not in CONNECT
    delete connectData.tls;
    return connectData;
  }
}

export const ProxyPlugin: FastifyPluginAsync<ProxyOptions> = fp(async (app: FastifyInstance, options: ProxyOptions) => {
  if (!options.upstream) {
    throw new Error('upstream must be specified');
  }

  const ws = new WebSocketProxy(app, options);

  app.addHook('preClose', (done: HookHandlerDoneFunction) => {
    ws.close();
    done();
  });
});
