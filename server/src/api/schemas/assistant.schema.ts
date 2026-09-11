import * as zod from 'zod';

export const assistantProviderSchema = zod.enum(['openai-compatible', 'ollama', 'openai', 'anthropic', 'gemini', 'openrouter']);

export const assistantModelInputSchema = zod
  .object({
    id: zod.string().trim().min(1).max(64).optional(),
    name: zod.string().trim().max(40, 'Name cannot be more than 40 characters').optional(),
    provider: assistantProviderSchema,
    baseURL: zod.string().trim().max(500, 'Base URL cannot be more than 500 characters').nullable().optional(),
    apiKey: zod.string().max(1000, 'API key cannot be more than 1000 characters').nullable().optional(),
    copyKeyFrom: zod.string().trim().min(1).max(64).optional(),
    model: zod.string().trim().max(200, 'Model cannot be more than 200 characters'),
    sendImages: zod.boolean().optional(),
    userAccess: zod.boolean().optional(),
    retest: zod.boolean().optional(),
  })
  .strict();

export const patchAssistantSchema = zod
  .object({
    enabled: zod.boolean().optional(),
    models: zod.array(assistantModelInputSchema).max(20, 'At most 20 models').optional(),
    defaultModelId: zod.string().trim().min(1).max(64).nullable().optional(),
    plugins: zod
      .array(zod.object({ pluginId: zod.string().trim().min(1).max(200), modelId: zod.string().trim().min(1).max(64) }).strict())
      .max(50)
      .optional(),
    language: zod.string().trim().max(16).nullable().optional(),
    maxIterations: zod.number().int().min(1).max(30).optional(),
    maxToolCalls: zod.number().int().min(1).max(100).optional(),
    contextTokens: zod.number().int().min(8_000).max(400_000).optional(),
    historyThreads: zod.number().int().min(5).max(500).optional(),
    historyImages: zod.number().int().min(0).max(200).optional(),
    terminalEnabled: zod.boolean().optional(),
    reasoning: zod.enum(['default', 'off', 'low', 'high']).optional(),
    systemPromptExtra: zod.string().max(4000, 'Additional instructions cannot be more than 4000 characters').optional(),
    mcpEnabled: zod.boolean().optional(),
    mcpWrites: zod.boolean().optional(),
    mcpServers: zod
      .array(
        zod
          .object({
            id: zod.string().trim().min(1).max(64).optional(),
            name: zod.string().trim().min(1, 'Name is required').max(40, 'Name cannot be more than 40 characters'),
            url: zod.url('Enter a valid URL').max(500),
            token: zod.string().max(4000).nullable().optional(),
            enabled: zod.boolean().default(true),
            insecure: zod.boolean().default(false),
          })
          .strict(),
      )
      .max(10, 'At most 10 external servers')
      .optional(),
    memoryEnabled: zod.boolean().optional(),
  })
  .strict();

export const assistantChatResumeSchema = zod.object({
  runId: zod.coerce.string().min(1).max(128).optional(),
  offset: zod.coerce.string().max(300).optional(),
  threadId: zod.coerce.string().min(1).max(128).optional(),
});

export const assistantChatCancelSchema = zod.object({
  runId: zod.string().min(1).max(128),
});

export const assistantSearchSchema = zod.object({
  text: zod.string().trim().min(1).max(500),
  language: zod.string().max(10).optional(),
  timezone: zod.string().max(64).optional(),
});

export const assistantMemoryParamsSchema = zod.object({
  factId: zod.string().min(1).max(128),
});

export const testAssistantSchema = assistantModelInputSchema;

export const assistantThreadParamsSchema = zod.object({
  threadId: zod.string().min(1).max(128),
});

export const renameAssistantThreadSchema = zod.object({
  title: zod.string().trim().min(1).max(60),
});

export const replaceAssistantThreadMessagesSchema = zod.object({ messages: zod.array(zod.unknown()).max(200) }).strict();

export const branchAssistantThreadSchema = zod.object({ until: zod.number().int().min(0).max(10_000) }).strict();

export const createAssistantProfileSchema = zod
  .object({
    name: zod.string().trim().min(1, 'Name is required').max(40, 'Name cannot be more than 40 characters'),
    modelId: zod.string().trim().max(64).default(''),
    disabledGroups: zod.array(zod.string().max(100)).max(50).default([]),
    instructions: zod.string().max(2000, 'Instructions cannot be more than 2000 characters').default(''),
  })
  .strict();

export const patchAssistantProfileSchema = createAssistantProfileSchema.partial().strict();

export const assistantProfileParamsSchema = zod.object({
  profileId: zod.string().min(1).max(128),
});

export const assistantProfilesQuerySchema = zod.object({
  user: zod.string().trim().min(1).max(100).optional(),
});

export const assistantScheduleDeliverySchema = zod.enum(['push', 'thread', 'both']);

export const createAssistantScheduleSchema = zod
  .object({
    title: zod.string().trim().min(1, 'Title is required').max(80, 'Title cannot be more than 80 characters'),
    prompt: zod.string().trim().min(1, 'Prompt is required').max(2000, 'Prompt cannot be more than 2000 characters'),
    cron: zod.string().trim().min(9, 'Cron expression is required').max(100),
    profileId: zod.string().trim().max(64).nullable().optional(),
    timezone: zod.string().trim().max(64).optional(),
    language: zod.string().trim().min(2).max(10).optional(),
    deliver: assistantScheduleDeliverySchema.default('push'),
    enabled: zod.boolean().default(true),
  })
  .strict();

export const patchAssistantScheduleSchema = createAssistantScheduleSchema.partial().strict();

export const assistantScheduleParamsSchema = zod.object({
  scheduleId: zod.string().min(1).max(128),
});

export type PatchAssistantInput = zod.output<typeof patchAssistantSchema>;
export type TestAssistantInput = zod.output<typeof testAssistantSchema>;
export type AssistantModelInput = zod.output<typeof assistantModelInputSchema>;
export type AssistantProfilesQueryInput = zod.output<typeof assistantProfilesQuerySchema>;
export type AssistantThreadParamsInput = zod.output<typeof assistantThreadParamsSchema>;
export type RenameAssistantThreadInput = zod.output<typeof renameAssistantThreadSchema>;
export type ReplaceAssistantThreadMessagesInput = zod.output<typeof replaceAssistantThreadMessagesSchema>;
export type BranchAssistantThreadInput = zod.output<typeof branchAssistantThreadSchema>;
export type CreateAssistantScheduleInput = zod.output<typeof createAssistantScheduleSchema>;
export type PatchAssistantScheduleInput = zod.output<typeof patchAssistantScheduleSchema>;
export type AssistantScheduleParamsInput = zod.output<typeof assistantScheduleParamsSchema>;
export type CreateAssistantProfileInput = zod.output<typeof createAssistantProfileSchema>;
export type PatchAssistantProfileInput = zod.output<typeof patchAssistantProfileSchema>;
export type AssistantProfileParamsInput = zod.output<typeof assistantProfileParamsSchema>;
export type AssistantMemoryParamsInput = zod.output<typeof assistantMemoryParamsSchema>;
export type AssistantChatResumeInput = zod.output<typeof assistantChatResumeSchema>;
export type AssistantChatCancelInput = zod.output<typeof assistantChatCancelSchema>;
export type AssistantSearchInput = zod.output<typeof assistantSearchSchema>;
