import { inject } from '../../container.js';
import { ConfigService } from '../../services/config/index.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export class ApiController {
  constructor(private app: FastifyInstance) {}

  public welcome(_req: FastifyRequest, reply: FastifyReply): FastifyReply {
    const version = ConfigService.RUNNING_VERSION;
    const configService = inject('configService');
    const installedVersion = configService.STAGED_VERSION ?? ConfigService.VERSION;
    const dbs = inject('dbs');
    return reply.code(200).send({
      message: 'Welcome to camera.ui API',
      version,
      installedVersion,
      restartRequired: installedVersion !== version,
      electron: ConfigService.ENVIRONMENT.electron,
      homeAssistant: configService.INGRESS_TRUST_IP !== undefined,
      instanceId: dbs.settingsDB.get('settings')?.instanceId ?? '',
    });
  }

  public async health(_req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    return reply.code(200).send({ status: 'ok' });
  }
}
