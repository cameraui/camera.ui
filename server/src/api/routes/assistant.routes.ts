import { AssistantController } from '../controllers/assistant.controller.js';
import { onlyAdminCanDoThisAction } from '../middlewares/authPermission.middleware.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import {
  assistantChatCancelSchema,
  assistantChatResumeSchema,
  assistantMemoryParamsSchema,
  assistantProfileParamsSchema,
  assistantScheduleParamsSchema,
  assistantSearchSchema,
  assistantThreadParamsSchema,
  branchAssistantThreadSchema,
  createAssistantProfileSchema,
  createAssistantScheduleSchema,
  patchAssistantProfileSchema,
  patchAssistantScheduleSchema,
  patchAssistantSchema,
  renameAssistantThreadSchema,
  replaceAssistantThreadMessagesSchema,
  testAssistantSchema,
} from '../schemas/assistant.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const AssistantRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const controller = new AssistantController(app);

  app.route({
    url: '/',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.getInfo.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Get assistant settings, status and the available tools',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.patchInfo.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Update assistant settings',
      body: patchAssistantSchema,
    },
  });

  app.route({
    url: '/status',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.getStatus.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Get the assistant state',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/test',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.test.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Probe the model with the given (unsaved) settings: connectivity, tool calling, vision',
      body: testAssistantSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/models',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.models.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'List the models the provider offers for the given (unsaved) settings',
      body: testAssistantSchema,
    },
  });

  app.route({
    url: '/chat',
    method: 'POST',
    preValidation: [validJWTNeeded],
    handler: controller.chat.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Run one chat turn and stream the answer as server-sent events',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/chat',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.chatResume.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Hydrate a conversation (threadId) or replay a run (runId, resumable stream)',
      querystring: assistantChatResumeSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/chat/cancel',
    method: 'POST',
    preValidation: [validJWTNeeded],
    handler: controller.chatCancel.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Stop a running chat run',
      body: assistantChatCancelSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/search',
    method: 'POST',
    preValidation: [validJWTNeeded],
    handler: controller.search.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Turn a wish in words into recordings page filters',
      body: assistantSearchSchema,
    },
  });

  app.route({
    url: '/mcp',
    method: 'POST',
    preValidation: [validJWTNeeded],
    handler: controller.mcp.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'MCP endpoint (Streamable HTTP, stateless) exposing the assistant tools to external AI clients',
    },
  });

  app.route({
    url: '/mcp',
    method: ['GET', 'DELETE'],
    preValidation: [validJWTNeeded],
    handler: controller.mcpMethodNotAllowed.bind(controller),
    schema: { hide: true },
  });

  app.route({
    url: '/threads',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.listThreads.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'List the conversations of the current user',
    },
  });

  app.route({
    url: '/threads',
    method: 'DELETE',
    preValidation: [validJWTNeeded],
    handler: controller.deleteAllThreads.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Delete every conversation of the current user',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/threads/:threadId',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.getThread.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Get one conversation with its messages',
      params: assistantThreadParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/threads/:threadId',
    method: 'PATCH',
    preValidation: [validJWTNeeded],
    handler: controller.renameThread.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Rename a conversation',
      params: assistantThreadParamsSchema,
      body: renameAssistantThreadSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/threads/:threadId/messages',
    method: 'PUT',
    preValidation: [validJWTNeeded],
    handler: controller.replaceThreadMessages.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Replace the messages of a conversation',
      params: assistantThreadParamsSchema,
      body: replaceAssistantThreadMessagesSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/threads/:threadId/branch',
    method: 'POST',
    preValidation: [validJWTNeeded],
    handler: controller.branchThread.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Copy a conversation up to one message into a new one',
      params: assistantThreadParamsSchema,
      body: branchAssistantThreadSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/threads/:threadId',
    method: 'DELETE',
    preValidation: [validJWTNeeded],
    handler: controller.deleteThread.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Delete a conversation',
      params: assistantThreadParamsSchema,
    },
  });

  app.route({
    url: '/usage',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.getUsage.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Token usage of the current user per month',
    },
  });

  app.route({
    url: '/usage/all',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.getUsageAll.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Token usage of every user per month',
    },
  });

  app.route({
    url: '/memory',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.listMemory.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'What the assistant remembers about the current user',
    },
  });

  app.route({
    url: '/memory',
    method: 'DELETE',
    preValidation: [validJWTNeeded],
    handler: controller.deleteMemory.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Forget everything about the current user',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/memory/:factId',
    method: 'DELETE',
    preValidation: [validJWTNeeded],
    handler: controller.deleteMemoryFact.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Forget one remembered fact',
      params: assistantMemoryParamsSchema,
    },
  });

  app.route({
    url: '/profiles',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.listProfiles.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'List the conversation profiles of the current user',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/profiles',
    method: 'POST',
    preValidation: [validJWTNeeded],
    handler: controller.createProfile.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Create a conversation profile',
      body: createAssistantProfileSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/profiles/:profileId',
    method: 'PATCH',
    preValidation: [validJWTNeeded],
    handler: controller.patchProfile.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Update a conversation profile',
      params: assistantProfileParamsSchema,
      body: patchAssistantProfileSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/profiles/:profileId',
    method: 'DELETE',
    preValidation: [validJWTNeeded],
    handler: controller.deleteProfile.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Delete a conversation profile',
      params: assistantProfileParamsSchema,
    },
  });

  app.route({
    url: '/schedules',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.listSchedules.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'List the scheduled prompts of the current user',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/schedules',
    method: 'POST',
    preValidation: [validJWTNeeded],
    handler: controller.createSchedule.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Create a scheduled prompt',
      body: createAssistantScheduleSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/schedules/:scheduleId',
    method: 'PATCH',
    preValidation: [validJWTNeeded],
    handler: controller.patchSchedule.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Update a scheduled prompt',
      params: assistantScheduleParamsSchema,
      body: patchAssistantScheduleSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/schedules/:scheduleId',
    method: 'DELETE',
    preValidation: [validJWTNeeded],
    handler: controller.deleteSchedule.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Delete a scheduled prompt',
      params: assistantScheduleParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/schedules/:scheduleId/run',
    method: 'POST',
    preValidation: [validJWTNeeded],
    handler: controller.runSchedule.bind(controller),
    schema: {
      tags: ['Assistant'],
      summary: 'Run a scheduled prompt now',
      params: assistantScheduleParamsSchema,
    },
  });
};
