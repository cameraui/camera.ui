import { buildHttpsUrl, fetchViableNetworkAddresses, isLanClientAddress, isLoopbackAddress, isLoopbackHost } from '@camera.ui/common/network';
import { container } from 'tsyringe';

import { PROXY_SERVICE_URL } from '../../services/config/constants.js';
import { RemoteService } from '../services/remote.service.js';
import { ServerService } from '../services/server.service.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { RemoteAccessManager } from '../../remote/index.js';
import type { ConnectionInfo, RemoteTestResult } from '../../remote/types.js';
import type { ConfigService } from '../../services/config/index.js';
import type { LoggerService } from '../../services/logger/index.js';
import type {
  AuthLoginRequest,
  CloudflareManagedConnectRequest,
  RemoteInfo,
  RemotePairPollRequest,
  RemotePatchRequest,
  RemoteRegisterRequest,
  RemoteTestRequest,
  RemoteUpdateServerNameRequest,
} from '../types/index.js';

export class RemoteController {
  private remoteAccessManager: RemoteAccessManager;
  private configService: ConfigService;
  private logger: LoggerService;

  private service: RemoteService;
  private serverService: ServerService;

  constructor(_app: FastifyInstance) {
    this.remoteAccessManager = container.resolve<RemoteAccessManager>('remoteAccessManager');
    this.configService = container.resolve<ConfigService>('configService');
    this.logger = container.resolve<LoggerService>('logger');

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
      const registrationId = await this.remoteAccessManager.getRegistrationId();
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
      const remoteInfo = this.service.info();
      const accessStatus = this.remoteAccessManager.getStatus();

      const port = this.configService.config.port;
      const selected = this.serverService.info().serverAddresses ?? [];
      const internalAddresses = fetchViableNetworkAddresses()
        .filter((addr) => selected.length === 0 || selected.includes(addr.address))
        .map((addr) => buildHttpsUrl(addr.address, port));

      const cloudAddress = remoteInfo.enabled ? PROXY_SERVICE_URL : null;

      const info: ConnectionInfo = {
        internalAddresses,
        externalUrl: accessStatus.externalUrl,
        cloudAddress,
        currentConnection: this.inferCurrentConnection(req, accessStatus.externalUrl, cloudAddress),
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

  private inferCurrentConnection(req: FastifyRequest, externalUrl: string | null, cloudAddress: string | null): ConnectionInfo['currentConnection'] {
    if (req.headers['x-forwarded-cloud'] === '1') {
      return { type: 'cloud', address: cloudAddress ?? this.localAddress(req) };
    }

    const hasReverseProxy = !!req.headers['x-forwarded-host'] || !!req.headers['x-forwarded-for'] || !!req.headers['cf-connecting-ip'] || !!req.headers['cf-ray'];
    if (!hasReverseProxy && isLoopbackAddress(req.ip ?? '')) {
      return { type: 'local', address: this.localAddress(req) };
    }

    if (!hasReverseProxy && isLanClientAddress(req.ip, req.socket?.localAddress)) {
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

  private localAddress(req: FastifyRequest): string {
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol;
    return `${proto}://${this.effectiveHost(req)}`;
  }

  private effectiveHost(req: FastifyRequest): string {
    const xfh = req.headers['x-forwarded-host'];
    if (typeof xfh === 'string' && xfh) return xfh;

    const sock = req.socket;
    if (sock?.localAddress && sock.localPort) {
      const ip = sock.localAddress.startsWith('::ffff:') ? sock.localAddress.slice(7) : sock.localAddress;
      if (isLoopbackAddress(ip)) {
        const host = req.headers.host;
        if (host && !isLoopbackHost(host)) return host;
      }
      const hostPart = ip.includes(':') ? `[${ip}]` : ip;
      return `${hostPart}:${sock.localPort}`;
    }

    return req.headers.host ?? 'localhost';
  }
}
