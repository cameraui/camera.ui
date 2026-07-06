import { resolve } from 'node:path';
import { container } from 'tsyringe';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ConfigService } from '../../services/config/index.js';
import type { AuthLoginRequest, FilesParamsRequest } from '../types/index.js';

export class FilesController {
  private configService: ConfigService;

  constructor(private app: FastifyInstance) {
    this.configService = container.resolve<ConfigService>('configService');
  }

  public async serve(req: FastifyRequest<AuthLoginRequest & FilesParamsRequest>, reply: FastifyReply): Promise<FastifyReply | void> {
    try {
      let file = req.params.file;
      let filesPath = this.configService.USERS_STORAGE_PATH;

      if (file.includes('_avatar.')) {
        file = file.includes('?r=') ? file.split('?r=')[0] : file;
        filesPath = this.configService.USERS_STORAGE_PATH;
      }

      await reply.sendFile(file, resolve(filesPath));
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }
}
