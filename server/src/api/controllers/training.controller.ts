import { readFile } from 'node:fs/promises';
import { container } from 'tsyringe';

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { TrainingCandidateManager } from '../../manager/trainingCandidateManager.js';
import type { TrainingCandidateListQuery, TrainingCandidatePatchInput, TrainingSettingsPatchInput, TrainingSubmitInput } from '../schemas/training.schema.js';
import type { AuthLoginRequest } from '../types/index.js';

export class TrainingController {
  private manager = container.resolve<TrainingCandidateManager>('trainingCandidateManager');

  public list(req: FastifyRequest<AuthLoginRequest & { Querystring: TrainingCandidateListQuery }>, reply: FastifyReply): FastifyReply {
    try {
      return reply.code(200).send(this.manager.list(req.query));
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async image(req: FastifyRequest<AuthLoginRequest & { Params: { id: string } }>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const path = this.manager.imagePath(req.params.id);
      if (!path) return reply.code(404).send({ statusCode: 404, message: 'Candidate not found' });
      const image = await readFile(path);
      return reply.code(200).header('content-type', 'image/jpeg').header('cache-control', 'private, max-age=31536000, immutable').send(image);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async update(req: FastifyRequest<AuthLoginRequest & { Params: { id: string }; Body: TrainingCandidatePatchInput }>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const existing = this.manager.get(req.params.id);
      if (existing && this.manager.isUploadLocked(existing)) {
        return reply.code(409).send({ statusCode: 409, message: 'Upload in progress' });
      }
      const updated = await this.manager.update(req.params.id, req.body);
      if (!updated) return reply.code(404).send({ statusCode: 404, message: 'Candidate not found' });
      return reply.code(200).send(updated);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async remove(req: FastifyRequest<AuthLoginRequest & { Params: { id: string } }>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const existing = this.manager.get(req.params.id);
      if (existing && this.manager.isUploadLocked(existing)) {
        return reply.code(409).send({ statusCode: 409, message: 'Upload in progress' });
      }
      const removed = await this.manager.remove(req.params.id);
      if (!removed) return reply.code(404).send({ statusCode: 404, message: 'Candidate not found' });
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async submit(req: FastifyRequest<AuthLoginRequest & { Body: TrainingSubmitInput }>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(202).send(await this.manager.queueSubmit(req.body.ids));
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async submissions(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(await this.manager.listSubmissions());
    } catch (error: any) {
      return reply.code(502).send({ statusCode: 502, message: error.message });
    }
  }

  public async removeSubmission(req: FastifyRequest<AuthLoginRequest & { Params: { id: string } }>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.manager.removeSubmission(req.params.id);
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(502).send({ statusCode: 502, message: error.message });
    }
  }

  public settings(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): FastifyReply {
    try {
      return reply.code(200).send(this.manager.getSettings());
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async updateSettings(req: FastifyRequest<AuthLoginRequest & { Body: TrainingSettingsPatchInput }>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(await this.manager.updateSettings(req.body));
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }
}
