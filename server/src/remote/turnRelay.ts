import { randomBytes } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { lookup } from 'node:dns/promises';
import { setTimeout as sleep } from 'node:timers/promises';

import { inject } from '../container.js';
import { cloudFetch } from './api/instance.js';

import type { Logger } from '@camera.ui/common';
import type { IceServer } from '@camera.ui/sdk/internal';
import type { RemoteService } from '../api/services/remote.service.js';
import type { RelayStatus } from '../api/types/index.js';

interface RelayAnswer {
  iceServers: IceServer[];
  expiresAt: string;
}

interface RelayCredentials {
  server: IceServer;
  mintedAt: number;
  expiresAt: number;
}

const SESSION_WAIT_MS = 1_500;
const NOT_OFFERED_RETRY_MS = 6 * 60 * 60_000;
const REFUSED_RETRY_MS = 24 * 60 * 60_000;
const BACKOFF_MIN_MS = 30_000;
const BACKOFF_MAX_MS = 30 * 60_000;
const STUN_HOST = 'stun.cloudflare.com';
const STUN_PORT = 3478;
const STUN_TIMEOUT_MS = 2_000;
const STUN_MAGIC_COOKIE = 0x2112a442;
const STUN_LOOKUP_TTL_MS = 60 * 60_000;

export class TurnRelay {
  private credentials?: RelayCredentials;
  private minting?: Promise<void>;
  private outcome?: 'ready' | 'unavailable';
  private retryAt = 0;
  private backoff = BACKOFF_MIN_MS;
  private stunIPv6?: { address: string; resolvedAt: number };

  constructor(
    private remoteService: RemoteService,
    private logger: Logger,
  ) {}

  public status(): RelayStatus {
    if (!this.remoteService.info().relay) return 'off';
    if (!this.remoteService.isCloudConnected()) return 'unlinked';
    if (this.minting || !this.outcome) return 'checking';
    return this.outcome;
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    await this.remoteService.patch({ relay: enabled });
    this.reset();
    if (enabled) this.check();
  }

  public check(): void {
    if (!this.outcome && this.usable()) this.mint();
  }

  public prefetch(): void {
    if (this.usable() && this.stale()) this.mint();
  }

  public async sessionServer(): Promise<IceServer | undefined> {
    if (!this.usable()) {
      this.reset();
      return undefined;
    }
    if (this.stale()) this.mint();
    if (this.minting && !this.valid()) {
      await Promise.race([this.minting, sleep(SESSION_WAIT_MS)]);
    }
    return this.valid() ? this.credentials?.server : undefined;
  }

  public async viewerIceServers(servers: IceServer[], remote: boolean): Promise<IceServer[]> {
    if (!this.remoteService.info().relay) return servers;
    // the relay only lets a viewer in from the public address the viewer's own STUN request reveals
    const withStun = servers.some((server) => server.urls.some((url) => /^stun:/i.test(url))) ? servers : [{ urls: [`stun:${STUN_HOST}:${STUN_PORT}`] }, ...servers];
    const ipv6 = remote ? await this.stunIPv6Address() : undefined;
    // WebKit in NAT64 networks sends from its IPv4 socket to one address only, a STUN entry for IPv6 alone keeps it for the relay
    return ipv6 ? [...withStun, { urls: [`stun:[${ipv6}]:${STUN_PORT}`] }] : withStun;
  }

  private usable(): boolean {
    return this.remoteService.info().relay && this.remoteService.isCloudConnected();
  }

  private async stunIPv6Address(): Promise<string | undefined> {
    if (this.stunIPv6 && Date.now() - this.stunIPv6.resolvedAt < STUN_LOOKUP_TTL_MS) return this.stunIPv6.address;
    try {
      const { address } = await lookup(STUN_HOST, { family: 6 });
      this.stunIPv6 = { address, resolvedAt: Date.now() };
      return address;
    } catch {
      return this.stunIPv6?.address;
    }
  }

  private stale(): boolean {
    if (!this.credentials) return true;
    const { mintedAt, expiresAt } = this.credentials;
    return Date.now() >= mintedAt + (expiresAt - mintedAt) / 2;
  }

  private valid(): boolean {
    return !!this.credentials && this.credentials.expiresAt > Date.now() + 60_000;
  }

  private reset(): void {
    this.credentials = undefined;
    this.outcome = undefined;
    this.retryAt = 0;
    this.backoff = BACKOFF_MIN_MS;
  }

  private mint(): void {
    if (this.minting || Date.now() < this.retryAt) return;
    this.minting = this.fetchCredentials().finally(() => {
      this.minting = undefined;
    });
  }

  private async fetchCredentials(): Promise<void> {
    const fetchCloud = cloudFetch({
      target: 'cloud',
      credentialStore: inject('cloudApi').credentialStore,
      requiredScopes: ['tunnel:connect'],
    });

    try {
      const [res, udp] = await Promise.all([fetchCloud('/api/v1/relay/credentials', { method: 'POST' }), stunReachable()]);
      if (res.status === 404 || res.status === 403) {
        this.outcome = 'unavailable';
        this.retryAt = Date.now() + (res.status === 404 ? NOT_OFFERED_RETRY_MS : REFUSED_RETRY_MS);
        this.logger.debug(`Relay not available, the cloud answered ${res.status}`);
        return;
      }
      if (!res.ok) {
        throw new Error(`the cloud answered ${res.status}`);
      }

      const answer = (await res.json()) as RelayAnswer;
      const picked = pickTransport(answer.iceServers, udp);
      if (!picked) {
        throw new Error('the cloud answer holds no TURN server');
      }
      const server = udp ? await pinIPv4(picked) : picked;
      if (!this.usable()) return;

      this.credentials = { server, mintedAt: Date.now(), expiresAt: Date.parse(answer.expiresAt) };
      this.outcome = 'ready';
      this.backoff = BACKOFF_MIN_MS;
      this.logger.debug(`Relay ready over ${udp ? 'UDP' : 'TCP and TLS'}`);
    } catch (error: any) {
      this.outcome = 'unavailable';
      this.retryAt = Date.now() + this.backoff;
      this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX_MS);
      this.logger.debug('Relay not available:', error?.message ?? error);
    }
  }
}

function pickTransport(servers: IceServer[], udp: boolean): IceServer | undefined {
  // one URL keeps the allocations per session down, TCP and TLS cover networks that drop outgoing UDP
  const turn = servers.find((server) => server.username && server.credential);
  if (!turn) return undefined;

  const urls = udp
    ? turn.urls.filter((url) => url.startsWith('turn:') && url.endsWith(':3478?transport=udp'))
    : turn.urls.filter((url) => url.endsWith(':80?transport=tcp') || (url.startsWith('turns:') && url.endsWith(':443?transport=tcp')));
  return { urls: urls.length ? urls : turn.urls, username: turn.username, credential: turn.credential };
}

async function pinIPv4(server: IceServer): Promise<IceServer> {
  // pion allocates once per local address of each family a host name resolves to, the relay itself is IPv4 only
  const urls = await Promise.all(
    server.urls.map(async (url) => {
      const match = /^turn:([^:?]+)(.*)$/.exec(url);
      if (!match) return url;
      try {
        const { address } = await lookup(match[1], { family: 4 });
        return `turn:${address}${match[2]}`;
      } catch {
        return url;
      }
    }),
  );
  return { ...server, urls };
}

function stunReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createSocket('udp4');
    const transactionId = randomBytes(12);
    const request = Buffer.alloc(20);
    request.writeUInt16BE(0x0001, 0);
    request.writeUInt32BE(STUN_MAGIC_COOKIE, 4);
    transactionId.copy(request, 8);

    let settled = false;
    const done = (reachable: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve(reachable);
    };
    const timer = setTimeout(() => done(false), STUN_TIMEOUT_MS);

    socket.on('error', () => done(false));
    socket.on('message', (message) => {
      if (message.length >= 20 && message.readUInt16BE(0) === 0x0101 && message.subarray(8, 20).equals(transactionId)) {
        done(true);
      }
    });
    socket.send(request, STUN_PORT, STUN_HOST, (error) => {
      if (error) done(false);
    });
  });
}
