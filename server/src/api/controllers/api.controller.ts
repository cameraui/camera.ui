import { ConfigService } from '../../services/config/index.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export class ApiController {
  constructor(private app: FastifyInstance) {}

  public welcome(_req: FastifyRequest, reply: FastifyReply): FastifyReply {
    const version = ConfigService.RUNNING_VERSION;
    const installedVersion = ConfigService.VERSION;
    return reply.code(200).send({
      message: 'Welcome to camera.ui API',
      version,
      installedVersion,
      restartRequired: installedVersion !== version,
      electron: ConfigService.ENVIRONMENT.electron,
    });
  }

  public async health(_req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    return reply.code(200).send({ status: 'ok' });
  }
}
