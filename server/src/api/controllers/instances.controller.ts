import { InstancesService } from '../services/instances.service.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthLoginRequest, CreateInstanceRequest, InstanceParamsRequest, UpdateInstanceRequest } from '../types/index.js';

export class InstancesController {
  private service: InstancesService;

  constructor(_app: FastifyInstance) {
    this.service = new InstancesService();
  }

  public getAll(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): FastifyReply {
    try {
      const result = this.service.getAll();
      return reply.code(200).send(result);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async create(req: FastifyRequest<AuthLoginRequest & CreateInstanceRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const instance = await this.service.create(req.body, req.locals.user!.username);
      return reply.code(201).send(instance);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async update(req: FastifyRequest<AuthLoginRequest & InstanceParamsRequest & UpdateInstanceRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const instance = await this.service.update(req.params.id, req.body);
      if (!instance) {
        return reply.code(404).send({ statusCode: 404, message: 'Instance not found' });
      }
      return reply.code(200).send(instance);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async toggleFavorite(req: FastifyRequest<AuthLoginRequest & InstanceParamsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const result = await this.service.toggleFavorite(req.params.id);
      if (result === undefined) {
        return reply.code(404).send({ statusCode: 404, message: 'Instance not found' });
      }
      return reply.code(200).send({ favorite: result });
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async remove(req: FastifyRequest<AuthLoginRequest & InstanceParamsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const success = await this.service.remove(req.params.id);
      if (!success) {
        return reply.code(404).send({ statusCode: 404, message: 'Instance not found' });
      }
      return reply.code(200).send({ message: 'Instance removed' });
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async loginToRemote(req: FastifyRequest<AuthLoginRequest & InstanceParamsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const userData = await this.service.loginToRemote(req.params.id);
      return reply.code(200).send(userData);
    } catch (error: any) {
      const status = error.message.includes('not found') ? 404 : error.message.includes('No credentials') ? 400 : 502;
      return reply.code(status).send({ statusCode: status, message: error.message });
    }
  }

  public getIdentity(_req: FastifyRequest, reply: FastifyReply): FastifyReply {
    try {
      const result = this.service.getIdentity();
      return reply.code(200).send(result);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async getLocalStatus(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const status = await this.service.getLocalStatus();
      return reply.code(200).send(status);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async getRemoteStatus(req: FastifyRequest<AuthLoginRequest & InstanceParamsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const status = await this.service.getRemoteStatus(req.params.id);
      return reply.code(200).send(status);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 502;
      return reply.code(statusCode).send({ statusCode, message: error.message });
    }
  }
}
