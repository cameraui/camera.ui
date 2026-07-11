import { MqttService } from '../services/mqtt.service.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthLoginRequest, MqttPatchRequest, MqttTestRequest } from '../types/index.js';

export class MqttController {
  private service: MqttService;

  constructor(_app: FastifyInstance) {
    this.service = new MqttService();
  }

  public async getMqttInfo(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(this.service.info());
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async getMqttStatus(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(this.service.status());
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async patchMqttInfo(req: FastifyRequest<AuthLoginRequest & MqttPatchRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const info = await this.service.patch(req.body);
      return reply.code(200).send(info);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async testMqttConnection(req: FastifyRequest<AuthLoginRequest & MqttTestRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const result = await this.service.test(req.body ?? {});
      return reply.code(200).send(result);
    } catch (error: any) {
      return reply.code(200).send({ ok: false, message: error.message });
    }
  }
}
