import { VirtualSensorsService } from '../services/virtualsensors.service.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthLoginRequest, VirtualSensorsCreateRequest, VirtualSensorsParamsRequest, VirtualSensorsPatchRequest } from '../types/index.js';

export class VirtualSensorsController {
  private service: VirtualSensorsService;

  constructor(_app: FastifyInstance) {
    this.service = new VirtualSensorsService();
  }

  public list(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): FastifyReply {
    try {
      return reply.code(200).send(this.service.list());
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public getById(req: FastifyRequest<AuthLoginRequest & VirtualSensorsParamsRequest>, reply: FastifyReply): FastifyReply {
    try {
      const sensor = this.service.getById(req.params.id);
      if (!sensor) {
        return reply.code(404).send({ statusCode: 404, message: 'Virtual sensor not found' });
      }
      return reply.code(200).send(sensor);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async create(req: FastifyRequest<AuthLoginRequest & VirtualSensorsCreateRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const sensor = await this.service.create(req.body);
      return reply.code(201).send(sensor);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async update(req: FastifyRequest<AuthLoginRequest & VirtualSensorsParamsRequest & VirtualSensorsPatchRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const sensor = await this.service.patch(req.params.id, req.body);
      if (!sensor) {
        return reply.code(404).send({ statusCode: 404, message: 'Virtual sensor not found' });
      }
      return reply.code(200).send(sensor);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async delete(req: FastifyRequest<AuthLoginRequest & VirtualSensorsParamsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const success = await this.service.delete(req.params.id);
      if (!success) {
        return reply.code(404).send({ statusCode: 404, message: 'Virtual sensor not found' });
      }
      return reply.code(200).send({ statusCode: 200, message: 'Virtual sensor deleted' });
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }
}
