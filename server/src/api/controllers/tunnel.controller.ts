import { buildHttpsUrl, fetchViableNetworkAddresses } from '@camera.ui/common/network';
import { container } from 'tsyringe';

import { ServerService } from '../services/server.service.js';

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RemoteAccessManager } from '../../remote/index.js';
import type { ConfigService } from '../../services/config/index.js';

export class TunnelController {
  private serverService: ServerService;
  private configService: ConfigService;
  private remoteAccessManager: RemoteAccessManager;

  constructor() {
    this.serverService = new ServerService();
    this.configService = container.resolve<ConfigService>('configService');
    this.remoteAccessManager = container.resolve<RemoteAccessManager>('remoteAccessManager');
  }

  public check(_req: FastifyRequest, reply: FastifyReply): FastifyReply {
    try {
      const result = this.getAddresses();
      return reply.code(200).send(result);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  private getAddresses(): { internalAddresses: string[]; externalAddresses: string[] } {
    const allAddresses = fetchViableNetworkAddresses();
    const selectedAddresses = this.serverService.info().serverAddresses ?? [];

    const port = this.configService.config.port;

    const internalAddresses: string[] = allAddresses
      .filter((addr) => selectedAddresses.length === 0 || selectedAddresses.includes(addr.address))
      .map((addr) => buildHttpsUrl(addr.address, port));

    const remoteStatus = this.remoteAccessManager.getStatus();
    const externalAddresses: string[] = [];
    if (remoteStatus.externalUrl) externalAddresses.push(remoteStatus.externalUrl);

    return { internalAddresses, externalAddresses };
  }
}
