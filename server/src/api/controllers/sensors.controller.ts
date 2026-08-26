import { SensorsService } from '../services/sensors.service.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  AuthLoginRequest,
  SensorsBulkDeleteRequest,
  SensorsCommandRequest,
  SensorsCreateVirtualRequest,
  SensorsHistoryRequest,
  SensorsListRequest,
  SensorsParamsRequest,
  SensorsPatchRequest,
} from '../types/index.js';

export class SensorsController {
  private service: SensorsService;

  constructor(_app: FastifyInstance) {
    this.service = new SensorsService();
  }

  public list(req: FastifyRequest<AuthLoginRequest & SensorsListRequest>, reply: FastifyReply): FastifyReply {
    try {
      return reply.code(200).send({ sensors: this.service.list(req.query.camera) });
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public getById(req: FastifyRequest<AuthLoginRequest & SensorsParamsRequest>, reply: FastifyReply): FastifyReply {
    try {
      const sensor = this.service.getById(req.params.id);
      if (!sensor) {
        return reply.code(404).send({ statusCode: 404, message: 'Sensor not found' });
      }
      return reply.code(200).send(sensor);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async createVirtual(req: FastifyRequest<AuthLoginRequest & SensorsCreateVirtualRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const sensor = await this.service.createVirtual(req.body);
      return reply.code(201).send(sensor);
    } catch (error: any) {
      return reply.code(400).send({ statusCode: 400, message: error.message });
    }
  }

  public async update(req: FastifyRequest<AuthLoginRequest & SensorsParamsRequest & SensorsPatchRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const sensor = await this.service.patch(req.params.id, req.body);
      if (!sensor) {
        return reply.code(404).send({ statusCode: 404, message: 'Sensor not found' });
      }
      return reply.code(200).send(sensor);
    } catch (error: any) {
      return reply.code(400).send({ statusCode: 400, message: error.message });
    }
  }

  public getHistory(req: FastifyRequest<AuthLoginRequest & SensorsParamsRequest & SensorsHistoryRequest>, reply: FastifyReply): FastifyReply {
    try {
      const history = this.service.getHistory(req.params.id, req.query.limit);
      if (!history) {
        return reply.code(404).send({ statusCode: 404, message: 'Sensor not found' });
      }
      return reply.code(200).send({ history });
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async delete(req: FastifyRequest<AuthLoginRequest & SensorsParamsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const result = await this.service.delete(req.params.id);
      if (result === 'not-found') {
        return reply.code(404).send({ statusCode: 404, message: 'Sensor not found' });
      }
      if (result === 'connected') {
        return reply.code(409).send({ statusCode: 409, message: 'Sensor is still provided by its plugin' });
      }
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async deleteBulk(req: FastifyRequest<AuthLoginRequest & SensorsBulkDeleteRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      let deleted = 0;
      const skipped: string[] = [];
      for (const id of req.body.ids) {
        const result = await this.service.delete(id);
        if (result === 'ok') deleted++;
        else skipped.push(id);
      }
      return reply.code(200).send({ deleted, skipped });
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async command(req: FastifyRequest<AuthLoginRequest & SensorsParamsRequest & SensorsCommandRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const result = await this.service.command(req.params.id, req.body.property, req.body.value);

      switch (result) {
        case 'not-found':
          return reply.code(404).send({ statusCode: 404, message: 'Sensor not found' });
        case 'read-only':
          return reply.code(400).send({ statusCode: 400, message: 'Sensor is read-only' });
        case 'disconnected':
          return reply.code(409).send({ statusCode: 409, message: 'Sensor is not connected' });
        case 'ok':
          return reply.code(204).send();
      }
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }
}
