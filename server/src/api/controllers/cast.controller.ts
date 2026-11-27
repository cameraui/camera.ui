import { CastService } from '../services/cast.service.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { CastInput } from '../schemas/cast.schema.js';
import type { AuthLoginRequest } from '../types/index.js';

export class CastController {
  private service: CastService;

  constructor(_app: FastifyInstance) {
    this.service = new CastService();
  }

  public async listTargets(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(this.service.listTargets());
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async cast(req: FastifyRequest<AuthLoginRequest & { Body: CastInput }>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const { deviceId, cameraId, startMs } = req.body;
      if (this.service.liveBlocked({ cameraId, startMs })) {
        return reply.code(403).send({ statusCode: 403, message: 'Camera is in privacy mode' });
      }
      const ok = await this.service.cast(deviceId, { cameraId, startMs });
      if (!ok) {
        return reply.code(404).send({ statusCode: 404, message: 'Cast target not reachable' });
      }
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }
}
