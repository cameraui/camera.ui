import { isLanClientAddress, isLoopbackAddress, isLoopbackHost } from '@camera.ui/common/network';
import { isEqual } from '@camera.ui/common/utils';

import { inject } from '../../container.js';
import { DEFAULT_ICE_SERVERS } from '../../services/config/constants.js';
import { browserIceServers, isTurnServer } from '../../services/config/ice-servers.js';
import { isRemoteClient } from '../plugins/relayCompression.js';
import { TURN_URL_PATTERN } from '../schemas/remote.schema.js';
import { RemoteService } from '../services/remote.service.js';
import { ServerService } from '../services/server.service.js';

import type { IceServer } from '@camera.ui/sdk/internal';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { TLSSocket } from 'node:tls';
import type { RemoteAccessManager } from '../../remote/index.js';
import type { ConnectionInfo, RemoteTestResult } from '../../remote/types.js';
import type { ConfigService } from '../../services/config/index.js';
import type { LoggerService } from '../../services/logger/index.js';
import type {
  AuthLoginRequest,
  CloudflareManagedConnectRequest,
  RelayInfo,
  RemoteInfo,
  RemotePairPollRequest,
  RemotePatchRequest,
  RemoteRegisterRequest,
  RemoteRelayPutRequest,
  RemoteTestRequest,
  RemoteUpdateServerNameRequest,
  RemoteWebrtcPutRequest,
  WebrtcSettings,
} from '../types/index.js';

function webrtcSettings(iceServers: IceServer[]): WebrtcSettings {
  return {
    stun: iceServers.flatMap((server) => server.urls.filter((url) => !TURN_URL_PATTERN.test(url))),
    turn: iceServers.filter(isTurnServer).map((server) => ({
      urls: server.urls.filter((url) => TURN_URL_PATTERN.test(url)),
      username: server.username ?? '',
      credentialSet: !!server.credential,
    })),
    defaultStun: DEFAULT_ICE_SERVERS.flatMap((server) => server.urls),
  };
}

function isTunnelToken(token: string): boolean {
  if (token.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(token)) {
    return false;
  }
  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    return typeof parsed?.a === 'string' && typeof parsed?.t === 'string' && typeof parsed?.s === 'string';
  } catch {
    return false;
  }
}

export class RemoteController {
  private remoteAccessManager: RemoteAccessManager;
  private logger: LoggerService;
  private configService: ConfigService;

  private service: RemoteService;
  private serverService: ServerService;

  constructor(_app: FastifyInstance) {
    this.remoteAccessManager = inject('remoteAccessManager');
    this.logger = inject('logger');
    this.configService = inject('configService');

    this.service = new RemoteService();
    this.serverService = new ServerService();
  }

  public async getRemoteInfo(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const info = this.service.info();
      const remoteAccessStatus = this.remoteAccessManager.getStatus();

      const remoteInfo: RemoteInfo = {
        remoteSettings: {
          ...info,
          cloudflare: { ...info.cloudflare, token: null },
        },
        externalUrl: remoteAccessStatus.externalUrl,
        cloudflareTokenSet: !!info.cloudflare?.token,
        cloudflareError: remoteAccessStatus.cloudflareError,
        directOverride: remoteAccessStatus.override,
      };

      return reply.code(200).send(remoteInfo);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async patchRemoteInfo(req: FastifyRequest<AuthLoginRequest & RemotePatchRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const cloudflare = req.body?.cloudflare;
      if (cloudflare) {
        const stored = this.service.info()?.cloudflare;
        const mode = cloudflare.mode ?? stored?.mode;
        const token = cloudflare.token === undefined ? stored?.token : cloudflare.token;

        if (mode === 'token' && !token) {
          return reply.code(400).send({
            statusCode: 400,
            message: 'Token is required when cloudflare.mode is "token"',
          });
        }

        if (typeof cloudflare.token === 'string' && !isTunnelToken(cloudflare.token)) {
          return reply.code(400).send({
            statusCode: 400,
            message: 'Token is not a Cloudflare tunnel token',
          });
        }
      }

      const remoteInfo = await this.service.patch(req.body);
      reply.code(200).send(remoteInfo);
      setTimeout(() => {
        this.remoteAccessManager.update().catch((error) => {
          this.logger.error('Failed to apply remote access settings:', error);
        });
      }, 500);
      return reply;
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async pairInit(req: FastifyRequest<AuthLoginRequest & RemoteRegisterRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const result = await this.service.initPairing(req.body?.name);
      return reply.code(200).send(result);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async pairPoll(req: FastifyRequest<AuthLoginRequest & RemotePairPollRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const registrationId = this.remoteAccessManager.pushToken ?? '';
      const enabled = this.remoteAccessManager.getStatus().enabled;
      const result = await this.service.pollPairing(enabled, registrationId, req.body?.name);
      return reply.code(200).send(result);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async unregisterServer(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.service.unregisterCloudServer();
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async getRegistrationStatus(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const status = await this.service.getRegistrationStatus();

      return reply.code(200).send(status);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async updateServerName(req: FastifyRequest<AuthLoginRequest & RemoteUpdateServerNameRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.service.updateCloudServerName(req.body.name);
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async getTunnelStatus(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const status = await this.remoteAccessManager.getTunnelStatus();
      return reply.code(200).send(status);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async getConnectionInfo(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const accessStatus = this.remoteAccessManager.getStatus();

      const info: ConnectionInfo = {
        internalAddresses: this.serverService.networkEndpoints().internalAddresses,
        externalUrl: accessStatus.externalUrl,
        currentConnection: this.inferCurrentConnection(req, accessStatus.externalUrl),
      };

      return reply.code(200).send(info);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async cloudflareManagedStatus(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(this.remoteAccessManager.cloudflareManagedStatus());
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async cloudflareManagedConnect(req: FastifyRequest<AuthLoginRequest & CloudflareManagedConnectRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.service.patch({ cloudflare: { hostname: req.body.hostname } });
      this.remoteAccessManager.cloudflareManagedConnect(req.body.hostname);
      return reply.code(202).send({ accepted: true });
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async cloudflareManagedCancel(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.remoteAccessManager.cloudflareManagedCancel();
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async cloudflareManagedDisconnect(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.remoteAccessManager.cloudflareManagedDisconnect();
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async cloudflareManagedLogout(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.remoteAccessManager.cloudflareManagedLogout();
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async testRemoteMode(req: FastifyRequest<AuthLoginRequest & RemoteTestRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const result = await this.remoteAccessManager.testMode(req.params.mode);
      return reply.code(200).send(result);
    } catch (error: any) {
      const result: RemoteTestResult = {
        ok: false,
        message: error.message ?? 'Unknown error',
        testedAt: Date.now(),
      };
      return reply.code(200).send(result);
    }
  }

  public getWebrtc(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): FastifyReply {
    return reply.code(200).send(webrtcSettings(this.configService.iceServers));
  }

  public getRelay(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): FastifyReply {
    const relay = this.remoteAccessManager.turnRelay;
    relay.check();
    const info: RelayInfo = { enabled: this.service.info().relay, status: relay.status() };
    return reply.code(200).send(info);
  }

  public async putRelay(req: FastifyRequest<AuthLoginRequest & RemoteRelayPutRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const relay = this.remoteAccessManager.turnRelay;
      await relay.setEnabled(req.body.enabled);
      const info: RelayInfo = { enabled: req.body.enabled, status: relay.status() };
      return reply.code(200).send(info);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async getIceServers(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    const servers = browserIceServers(this.configService.iceServers);
    return reply.code(200).send(await this.remoteAccessManager.turnRelay.viewerIceServers(servers, isRemoteClient(req.raw)));
  }

  public async putWebrtc(req: FastifyRequest<AuthLoginRequest & RemoteWebrtcPutRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const { stun, turn } = req.body;
      const current = this.configService.iceServers;
      const storedTurn = current.filter(isTurnServer);

      const turnServers: IceServer[] = [];
      for (const { urls, username, credential, storedIndex } of turn) {
        const password = credential ?? (storedIndex === undefined ? undefined : storedTurn[storedIndex]?.credential);
        if (!password) {
          return reply.code(400).send({
            statusCode: 400,
            message: 'Password is required',
          });
        }
        turnServers.push({ urls, username, credential: password });
      }

      const iceServers: IceServer[] = [...(stun.length ? [{ urls: stun }] : []), ...turnServers];

      if (!isEqual(iceServers, current)) {
        await this.configService.writeGo2RtcConfigApi({ webrtc: { ice_servers: iceServers } });
      }

      return reply.code(200).send(webrtcSettings(iceServers));
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  private inferCurrentConnection(req: FastifyRequest, externalUrl: string | null): ConnectionInfo['currentConnection'] {
    const proxied = this.isProxied(req);
    if (!proxied && isLoopbackAddress(req.ip ?? '')) {
      return { type: 'local', address: this.localAddress(req) };
    }

    // behind a local hop the reached listener is unknown, the private-range checks still apply
    const listener = req.socket?.localAddress && isLoopbackAddress(req.socket.localAddress) ? '0.0.0.0' : req.socket?.localAddress;
    if (!proxied && isLanClientAddress(req.ip, listener)) {
      return { type: 'lan', address: this.localAddress(req) };
    }

    const local = this.localAddress(req);
    let useFallback = false;
    try {
      useFallback = isLoopbackHost(new URL(local).host);
    } catch {
      useFallback = true;
    }
    return { type: 'external', address: useFallback ? (externalUrl ?? local) : local };
  }

  private isProxied(req: FastifyRequest): boolean {
    if (req.headers['x-forwarded-host'] || req.headers['cf-connecting-ip'] || req.headers['cf-ray']) return true;
    // a local hop is trusted, req.ip already names the client behind it
    return !!req.headers['x-forwarded-for'] && !isLoopbackAddress(req.socket?.remoteAddress ?? '');
  }

  private localAddress(req: FastifyRequest): string {
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol;
    return `${proto}://${this.effectiveHost(req)}`;
  }

  private effectiveHost(req: FastifyRequest): string {
    const xfh = req.headers['x-forwarded-host'];
    if (typeof xfh === 'string' && xfh) return xfh;

    if (this.isProxied(req)) {
      const host = req.headers.host;
      if (host && !isLoopbackHost(host)) return host;
    }

    const sock = req.socket;
    if (sock?.localAddress && sock.localPort) {
      const ip = sock.localAddress.startsWith('::ffff:') ? sock.localAddress.slice(7) : sock.localAddress;
      if (isLoopbackAddress(ip)) {
        const host = req.headers.host;
        if (host && !isLoopbackHost(host)) return host;
      }
      const hostPart = ip.includes(':') ? `[${ip}]` : ip;
      // the app only speaks TLS, a plain socket is the in-process hop behind the http listener
      const port = (sock as TLSSocket).encrypted ? sock.localPort : (this.configService.config.insecurePort ?? sock.localPort);
      return `${hostPart}:${port}`;
    }

    return req.headers.host ?? 'localhost';
  }
}
