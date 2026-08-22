import { CatalogConflictError, FloorPlanService } from '../services/floorplan.service.js';

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PutFloorPlanInput } from '../schemas/floorplan.schema.js';
import type { AuthLoginRequest } from '../types/index.js';

export class FloorPlanController {
  private service: FloorPlanService;

  constructor() {
    this.service = new FloorPlanService();
  }

  public get(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): FastifyReply {
    try {
      return reply.code(200).send(this.service.get());
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async replace(req: FastifyRequest<AuthLoginRequest & { Body: PutFloorPlanInput }>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(await this.service.replace(req.body));
    } catch (error: any) {
      if (error instanceof CatalogConflictError) {
        return reply.code(409).send({ statusCode: 409, message: error.message });
      }
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }
}
