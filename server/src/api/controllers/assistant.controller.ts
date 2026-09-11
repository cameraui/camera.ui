import { memoryStream, resumeServerSentEventsResponse } from '@tanstack/ai';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { container } from 'tsyringe';

import { AssistantService } from '../services/assistant.service.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { AssistantManager } from '../../assistant/manager.js';
import type {
  AssistantChatCancelRequest,
  AssistantChatRequest,
  AssistantChatResumeRequest,
  AssistantMemoryRequest,
  AssistantPatchRequest,
  AssistantProfileCreateRequest,
  AssistantProfilePatchRequest,
  AssistantProfileRequest,
  AssistantProfilesListRequest,
  AssistantScheduleCreateRequest,
  AssistantSchedulePatchRequest,
  AssistantScheduleRequest,
  AssistantSearchRequest,
  AssistantTestRequest,
  AssistantThreadBranchRequest,
  AssistantThreadMessagesRequest,
  AssistantThreadRenameRequest,
  AssistantThreadRequest,
  AuthLoginRequest,
} from '../types/index.js';

export class AssistantController {
  private service: AssistantService;

  constructor(_app: FastifyInstance) {
    this.service = new AssistantService();
  }

  public async getInfo(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(this.service.info(req.locals.user?.role));
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async getStatus(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(this.service.status(req.locals.user?.role));
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async patchInfo(req: FastifyRequest<AuthLoginRequest & AssistantPatchRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(await this.service.patch(req.body));
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async test(req: FastifyRequest<AuthLoginRequest & AssistantTestRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(await this.service.test(req.body));
    } catch (error: any) {
      return reply.code(200).send({ ok: false, toolCalling: false, vision: null, latencyMs: 0, model: '', error: error.message });
    }
  }

  public async models(req: FastifyRequest<AuthLoginRequest & AssistantTestRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(await this.service.models(req.body));
    } catch (error: any) {
      return reply.code(200).send({ models: [], error: error.message });
    }
  }

  public async chat(req: FastifyRequest<AuthLoginRequest & AssistantChatRequest>, reply: FastifyReply): Promise<void> {
    const user = req.locals.user!;
    const manager = container.resolve<AssistantManager>('assistantManager');
    const body = (req.body ?? {}) as Record<string, unknown>;
    const runId = typeof body.runId === 'string' && body.runId ? body.runId : randomUUID();
    const durability = memoryStream({ runId, offset: firstHeader(req.headers['last-event-id']) ?? null });

    if (durability.resumeFrom() !== null) {
      if (manager.runOwner(runId) !== user._id) {
        reply.code(404).send({ statusCode: 404, message: 'Run not found' });
        return;
      }
      await pipeResponse(reply, resumeServerSentEventsResponse({ adapter: durability }));
      return;
    }

    let response: Response;
    try {
      response = await manager.run({
        body: { ...body, runId },
        user,
        authorization: firstHeader(req.headers.authorization),
        language: firstHeader(req.headers['x-cui-language']),
        timezone: firstHeader(req.headers['x-cui-timezone']),
        durability,
      });
    } catch (error: any) {
      reply.code(400).send({ statusCode: 400, message: error.message });
      return;
    }
    await pipeResponse(reply, response);
  }

  // a reload or a second tab either asks what a conversation holds (threadId) or joins a run that is still streaming (runId)
  public async chatResume(req: FastifyRequest<AuthLoginRequest & AssistantChatResumeRequest>, reply: FastifyReply): Promise<void> {
    const manager = container.resolve<AssistantManager>('assistantManager');
    const user = req.locals.user!;
    const { runId, offset, threadId } = req.query;
    if (threadId) {
      const hydrated = await manager.hydrate(user._id, threadId);
      reply.header('Cache-Control', 'no-store').code(200).send(hydrated);
      return;
    }
    if (!runId || manager.runOwner(runId) !== user._id) {
      reply.code(404).send({ statusCode: 404, message: 'Run not found' });
      return;
    }
    await pipeResponse(reply, resumeServerSentEventsResponse({ adapter: memoryStream({ runId, offset: offset ?? '-1' }) }));
  }

  public async chatCancel(req: FastifyRequest<AuthLoginRequest & AssistantChatCancelRequest>, reply: FastifyReply): Promise<FastifyReply> {
    const manager = container.resolve<AssistantManager>('assistantManager');
    const stopped = manager.cancelRun(req.body.runId, req.locals.user!._id);
    return reply.code(stopped ? 204 : 404).send(stopped ? undefined : { statusCode: 404, message: 'Run not found' });
  }

  public async search(req: FastifyRequest<AuthLoginRequest & AssistantSearchRequest>, reply: FastifyReply): Promise<FastifyReply> {
    const manager = container.resolve<AssistantManager>('assistantManager');
    try {
      return reply.code(200).send(await manager.search(req.locals.user!, req.body.text, { language: req.body.language, timezone: req.body.timezone }));
    } catch (error: any) {
      return reply.code(400).send({ statusCode: 400, message: error.message });
    }
  }

  public async mcp(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<void> {
    const manager = container.resolve<AssistantManager>('assistantManager');
    if (!manager.settings().mcpEnabled) {
      reply.code(404).send({ statusCode: 404, message: 'MCP is disabled' });
      return;
    }

    await manager.runMcp(req, reply, {
      user: req.locals.user!,
      authorization: firstHeader(req.headers.authorization),
      language: firstHeader(req.headers['x-cui-language']),
      timezone: firstHeader(req.headers['x-cui-timezone']),
    });
  }

  public mcpMethodNotAllowed(_req: FastifyRequest, reply: FastifyReply): FastifyReply {
    return reply.code(405).header('Allow', 'POST').send({ statusCode: 405, message: 'Use POST, this MCP endpoint is stateless' });
  }

  public async listThreads(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(this.service.listThreads(req.locals.user!._id));
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async getThread(req: FastifyRequest<AuthLoginRequest & AssistantThreadRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const thread = this.service.getThread(req.locals.user!._id, req.params.threadId);
      if (!thread) return reply.code(404).send({ statusCode: 404, message: 'Thread not found' });
      return reply.code(200).send(thread);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async renameThread(req: FastifyRequest<AuthLoginRequest & AssistantThreadRenameRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const thread = await this.service.renameThread(req.locals.user!._id, req.params.threadId, req.body.title);
      if (!thread) return reply.code(404).send({ statusCode: 404, message: 'Thread not found' });
      return reply.code(200).send(thread);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async replaceThreadMessages(req: FastifyRequest<AuthLoginRequest & AssistantThreadMessagesRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const thread = await this.service.replaceThreadMessages(req.locals.user!._id, req.params.threadId, req.body.messages);
      if (!thread) return reply.code(404).send({ statusCode: 404, message: 'Thread not found' });
      return reply.code(200).send(thread);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async branchThread(req: FastifyRequest<AuthLoginRequest & AssistantThreadBranchRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const thread = await this.service.branchThread(req.locals.user!._id, req.params.threadId, req.body.until);
      if (!thread) return reply.code(404).send({ statusCode: 404, message: 'Thread not found' });
      return reply.code(201).send(thread);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async deleteThread(req: FastifyRequest<AuthLoginRequest & AssistantThreadRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const removed = await this.service.deleteThread(req.locals.user!._id, req.params.threadId);
      if (!removed) return reply.code(404).send({ statusCode: 404, message: 'Thread not found' });
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async getUsage(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(this.service.listUsage(req.locals.user!._id));
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async getUsageAll(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(this.service.listUsageAll());
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async listMemory(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(this.service.listMemory(req.locals.user!._id));
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async deleteMemoryFact(req: FastifyRequest<AuthLoginRequest & AssistantMemoryRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const removed = await this.service.deleteMemoryFact(req.locals.user!._id, req.params.factId);
      if (!removed) return reply.code(404).send({ statusCode: 404, message: 'Fact not found' });
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async deleteMemory(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.service.deleteMemory(req.locals.user!._id);
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async listProfiles(req: FastifyRequest<AuthLoginRequest & AssistantProfilesListRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const user = req.locals.user!;
      const username = req.query.user;
      if (!username || username === user.username) return reply.code(200).send(this.service.listProfiles(user._id));
      if (user.role !== 'admin' && user.role !== 'master') return reply.code(403).send({ statusCode: 403, message: 'Only admins can list the profiles of other users' });
      const profiles = this.service.listProfilesOf(username);
      if (!profiles) return reply.code(404).send({ statusCode: 404, message: 'User not found' });
      return reply.code(200).send(profiles);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async createProfile(req: FastifyRequest<AuthLoginRequest & AssistantProfileCreateRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(201).send(await this.service.createProfile(req.locals.user!._id, req.body));
    } catch (error: any) {
      return reply.code(400).send({ statusCode: 400, message: error.message });
    }
  }

  public async patchProfile(req: FastifyRequest<AuthLoginRequest & AssistantProfilePatchRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const profile = await this.service.updateProfile(req.locals.user!._id, req.params.profileId, req.body);
      if (!profile) return reply.code(404).send({ statusCode: 404, message: 'Profile not found' });
      return reply.code(200).send(profile);
    } catch (error: any) {
      return reply.code(400).send({ statusCode: 400, message: error.message });
    }
  }

  public async deleteProfile(req: FastifyRequest<AuthLoginRequest & AssistantProfileRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const removed = await this.service.deleteProfile(req.locals.user!._id, req.params.profileId);
      if (!removed) return reply.code(404).send({ statusCode: 404, message: 'Profile not found' });
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async listSchedules(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(this.service.listSchedules(req.locals.user!._id));
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async createSchedule(req: FastifyRequest<AuthLoginRequest & AssistantScheduleCreateRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(201).send(await this.service.createSchedule(req.locals.user!._id, req.body));
    } catch (error: any) {
      return reply.code(400).send({ statusCode: 400, message: error.message });
    }
  }

  public async patchSchedule(req: FastifyRequest<AuthLoginRequest & AssistantSchedulePatchRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const schedule = await this.service.updateSchedule(req.locals.user!._id, req.params.scheduleId, req.body);
      if (!schedule) return reply.code(404).send({ statusCode: 404, message: 'Schedule not found' });
      return reply.code(200).send(schedule);
    } catch (error: any) {
      return reply.code(400).send({ statusCode: 400, message: error.message });
    }
  }

  public async deleteSchedule(req: FastifyRequest<AuthLoginRequest & AssistantScheduleRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const removed = await this.service.deleteSchedule(req.locals.user!._id, req.params.scheduleId);
      if (!removed) return reply.code(404).send({ statusCode: 404, message: 'Schedule not found' });
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async runSchedule(req: FastifyRequest<AuthLoginRequest & AssistantScheduleRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const schedule = await this.service.runSchedule(req.locals.user!._id, req.params.scheduleId);
      if (!schedule) return reply.code(404).send({ statusCode: 404, message: 'Schedule not found' });
      return reply.code(200).send(schedule);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async deleteAllThreads(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.service.deleteAllThreads(req.locals.user!._id);
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ? raw.trim() : undefined;
}

async function pipeResponse(reply: FastifyReply, response: Response): Promise<void> {
  reply.hijack();
  const headers: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(reply.getHeaders())) {
    if (value !== undefined) headers[key] = Array.isArray(value) ? value : String(value);
  }
  Object.assign(headers, { 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  response.headers.forEach((value, key) => (headers[key] = value));
  reply.raw.writeHead(response.status, headers);
  reply.raw.flushHeaders?.();
  if (!response.body) {
    reply.raw.end();
    return;
  }
  try {
    await pipeline(Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>), reply.raw);
  } catch {
    // client went away or the run aborted, nothing left to tell it
    if (!reply.raw.writableEnded) reply.raw.end();
  }
}
