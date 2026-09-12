import { hasInterface, PluginInterface, Severity } from '@camera.ui/sdk';
import { chat, chatParamsFromRequestBody, EventType, maxIterations, modelMessagesToUIMessages, toolDefinition, toServerSentEventsResponse } from '@tanstack/ai';
import { clearToolResults, composeStrategies, evictOldest, withCompaction } from '@tanstack/ai-compaction';
import { memoryMiddleware } from '@tanstack/ai-memory';
import { withPersistence } from '@tanstack/ai-persistence';
import { toolCacheMiddleware } from '@tanstack/ai/middlewares';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { container } from 'tsyringe';
import * as zod from 'zod';

import { CamerasService } from '../api/services/cameras.service.js';
import { PluginsService } from '../api/services/plugins.service.js';
import { RoomsService } from '../api/services/rooms.service.js';
import { UsersService } from '../api/services/users.service.js';
import { decryptPassword, encryptPassword } from '../api/utils/encryption.js';
import { secretGuard } from './guard.js';
import { ASK_USER_INTERRUPT } from './interrupts.js';
import { AssistantMcp } from './mcp.js';
import { AssistantMemoryStore, memoryAdapter } from './memory.js';
import { abortStaleRuns, lmdbPersistence } from './persistence.js';
import { estimateCost, warmPrices } from './pricing.js';
import { AssistantProfileStore } from './profiles.js';
import { buildSystemPrompt } from './prompt.js';
import { createAdapter, listModels, providerNeedsKey } from './providers.js';
import { modelOptionsFor } from './reasoning.js';
import { AssistantToolRegistry, toolGroup } from './registry.js';
import { withEmptyTurnRetry } from './retry.js';
import { AssistantScheduler, PUSH_BODY_MAX } from './scheduler.js';
import { SEARCH_SCHEMA, searchPrompt, toSearchResult } from './search.js';
import { AssistantThreadStore, contentParts } from './threads.js';
import { isBrowserTool } from './tools/index.js';
import { describeUploads, extractUploads, messagesForModel } from './uploads.js';
import { AssistantUsageStore } from './usage.js';

import type { ChatMiddleware, Interrupt, ModelMessage, StreamChunk, StreamDurability, SystemPrompt, UIMessage } from '@tanstack/ai';
import type { MemoryAdapter, MemoryTurn } from '@tanstack/ai-memory';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CameraUiAPI } from '../api.js';
import type { Database } from '../api/database/index.js';
import type {
  DBAssistant,
  DBAssistantAttachment,
  DBAssistantAttachmentNotice,
  DBAssistantAttachmentReference,
  DBAssistantCard,
  DBAssistantMcpServer,
  DBAssistantModel,
  DBAssistantProfile,
  DBRoles,
  DBUser,
} from '../api/database/types.js';
import type { Server } from '../api/index.js';
import type { SocketService } from '../api/websocket/index.js';
import type { ProxyServer } from '../rpc/index.js';
import type { ConfigService } from '../services/config/index.js';
import type { LoggerService } from '../services/logger/index.js';
import type { ExternalServer } from './external.js';
import type { AssistantQuestion } from './interrupts.js';
import type { MemoryChange } from './memory.js';
import type { ToolImage } from './tools/shared.js';
import type {
  AssistantAccess,
  AssistantAskRequest,
  AssistantAskResult,
  AssistantHydration,
  AssistantInfo,
  AssistantModelsResult,
  AssistantPost,
  AssistantRunContext,
  AssistantRunStats,
  AssistantSearchResult,
  AssistantSettings,
  AssistantStatus,
  AssistantTestResult,
  AssistantUsageEvent,
} from './types.js';

export interface AssistantRunRequest {
  body: unknown;
  user: DBUser;
  authorization?: string;
  language?: string;
  timezone?: string;
  signal?: AbortSignal;
  durability?: StreamDurability<string>;
}

const DEFAULT_CONTEXT_TOKENS = 48_000;
const DEFAULT_HISTORY_THREADS = 50;
const DEFAULT_HISTORY_IMAGES = 24;
const TERMINAL_GROUP = 'terminal';
const TOOL_CACHE_TTL_MS = 45_000;

const CACHED_TOOLS = [
  'list_cameras',
  'get_system_status',
  'get_floor_plan',
  'plugin_capabilities',
  'docs_search',
  'docs_read',
  'api_search',
  'list_scheduled_prompts',
  'automation_catalog',
];

const USAGE_EVENT = 'assistant.usage';
const ASK_TIMEOUT_MS = 45_000;
const ASK_TIMEOUT_MAX_MS = 300_000;
const ASK_CONCURRENCY = 4;
const EMPTY_TURN_LOG = 'Assistant: the model ended a turn without text or tool call, asking once more';
const EXTRACT_TIMEOUT_MS = 30_000;
const EXTRACT_MAX_CHARS = 1500;

// prettier-ignore
const EXTRACT_PROMPT =
  'You maintain a short list of durable facts about the user of a home camera system: names of people and pets, which camera watches what, ' +
  'how they want answers, routines. From the exchange you get, output JSON {"add": [...], "remove": [...]}: add = new facts as short third-person ' +
  'statements in the language of the user (at most 3), remove = existing facts the exchange proves wrong or outdated, copied verbatim. ' +
  'A fact comes from what the user wrote about themselves or their home and would still be true next month. The assistant text is context only: ' +
  'what the cameras saw, who left or arrived, what happened this week are events, never facts, even when they name a person. ' +
  'A question ("what were the highlights", "is the garage closed") yields no fact. Never passwords or tokens. ' +
  'Output {"add":[],"remove":[]} when nothing qualifies, which is the usual case. JSON only, no prose.';

// matches the eviction window of the in-memory durability log
const REPLAY_RETENTION_MS = 5 * 60_000;
const NO_MIDDLEWARE: ChatMiddleware = { name: 'camera.ui-memory-off' };
const SEARCH_TIMEOUT_MS = 45_000;
const REFERENCE_KINDS = new Set(['event', 'episode', 'camera', 'download']);
const FINAL_TURN_PROMPT = 'The tool budget of this run is used up. Answer now with what you already know and say plainly what you could not check.';
const TEST_TIMEOUT_MS = 45_000;
const PROBE_IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

export class AssistantManager {
  public readonly registry: AssistantToolRegistry;
  public readonly scheduler: AssistantScheduler;
  public readonly threads: AssistantThreadStore;
  public readonly profiles: AssistantProfileStore;
  public readonly usage: AssistantUsageStore;
  public readonly memory: AssistantMemoryStore;

  private mcp: AssistantMcp;
  private runs = new Map<string, { userId: string; threadId: string; abort: AbortController; finishedAt?: number }>();
  private askSlots = new Map<string, { active: number; waiters: (() => void)[] }>();
  private memoryAdapter: MemoryAdapter;
  private memoryMiddleware: ChatMiddleware;
  private logger: LoggerService;
  private dbs: Database;
  private configService: ConfigService;

  constructor() {
    container.registerInstance('assistantManager', this);

    this.logger = container.resolve<LoggerService>('logger');
    this.dbs = container.resolve<Database>('dbs');
    this.configService = container.resolve<ConfigService>('configService');
    this.registry = new AssistantToolRegistry();
    this.threads = new AssistantThreadStore();
    this.profiles = new AssistantProfileStore();
    this.usage = new AssistantUsageStore();
    this.memory = new AssistantMemoryStore();
    this.memoryAdapter = memoryAdapter(this.memory, (userId, turn, existing) => this.extractFacts(userId, turn, existing), this.logger);
    this.memoryMiddleware = memoryMiddleware({
      adapter: this.memoryAdapter,
      scope: (ctx) => ({ threadId: ctx.threadId, userId: (ctx.context as AssistantRunContext).userId }),
    });
    this.scheduler = new AssistantScheduler(this);
    this.mcp = new AssistantMcp(this.registry);
  }

  public async start(): Promise<void> {
    this.registry.loadApi(container.resolve<Server>('server').app?.swagger());
    this.registry.loadDocs();
    const stale = await abortStaleRuns(this.dbs).catch(() => 0);
    if (stale) this.logger.debug(`Assistant: ${stale} runs were still marked running from before the restart`);
    await this.registry.start();
    this.registry.syncExternal(this.externalServers(this.settings()));
    this.scheduler.start();
  }

  public async stop(): Promise<void> {
    this.scheduler.stop();
    await this.registry.stop();
  }

  public settings(): AssistantSettings {
    const record: DBAssistant = Object.assign(
      {
        models: [],
        defaultModelId: null,
        plugins: [],
        mcpEnabled: false,
        mcpWrites: false,
        reasoning: 'default' as const,
        mcpServers: [],
        contextTokens: DEFAULT_CONTEXT_TOKENS,
        memoryEnabled: true,
        historyThreads: DEFAULT_HISTORY_THREADS,
        historyImages: DEFAULT_HISTORY_IMAGES,
        terminalEnabled: false,
      },
      this.dbs.assistantDB.get('assistant')!,
    );
    const entry = defaultEntry(record);
    return {
      ...record,
      mcpServers: record.mcpServers.map((server) => ({ ...server, toolApproval: server.toolApproval ?? {} })),
      provider: entry?.provider ?? 'ollama',
      baseURL: entry?.baseURL ?? null,
      apiKey: entry?.apiKey ?? null,
      model: entry?.model ?? '',
      sendImages: entry ? sendsImages(entry) : false,
    };
  }

  public resolveModel(user: Pick<DBUser, '_id' | 'role'>, pick: { modelId?: string; profileId?: string } = {}): DBAssistantModel | undefined {
    const settings = this.settings();
    const models = modelsFor(settings.models, user.role);
    const profile = pick.profileId ? this.profiles.get(user._id, pick.profileId) : undefined;
    return (
      models.find((entry) => entry._id === pick.modelId) ??
      models.find((entry) => entry._id === profile?.modelId) ??
      models.find((entry) => entry._id === defaultEntry(settings)?._id) ??
      models[0]
    );
  }

  public defaultModel(): DBAssistantModel | undefined {
    return defaultEntry(this.settings());
  }

  public status(role?: DBRoles): AssistantStatus {
    const settings = this.settings();
    const entry = defaultEntry({ models: modelsFor(settings.models, role), defaultModelId: settings.defaultModelId });
    const configured = entry !== undefined && entryConfigured(entry);
    return {
      state: !settings.enabled ? 'disabled' : configured ? 'ready' : 'unconfigured',
      provider: entry?.provider ?? settings.provider,
      model: entry?.model ?? '',
      toolCount: this.registry.toolCount,
      pluginToolCount: this.registry.pluginToolCount,
    };
  }

  public info(role?: DBRoles): AssistantInfo {
    const { apiKey: _apiKey, provider: _provider, baseURL: _baseURL, model: _model, sendImages: _sendImages, mcpServers, models, ...settings } = this.settings();
    const servers = mcpServers.map(({ token, ...server }) => ({ ...server, tokenSet: token !== null }));
    const views = modelsFor(models, role).map(({ apiKey, ...entry }) => ({ ...entry, apiKeySet: apiKey !== null }));
    return {
      settings: { ...settings, mcpServers: servers, models: views },
      status: this.status(role),
      plugins: new PluginsService()
        .listPlugins()
        .filter((plugin) => hasInterface(plugin.contract, PluginInterface.AssistantTools))
        .map((plugin) => ({ id: plugin.id, name: plugin.displayName })),
      tools: this.registry.describe(role).filter((tool) => settings.terminalEnabled ?? tool.group !== TERMINAL_GROUP),
      external: this.registry.externalStatus(this.externalServers(this.settings())),
    };
  }

  public reloadExternal(): void {
    this.registry.syncExternal(this.externalServers(this.settings()));
  }

  public async post(post: AssistantPost): Promise<void> {
    const now = Date.now();
    const key = `post-${now.toString(36)}`;
    const messages = [
      {
        id: `${now}-post`,
        role: 'assistant',
        parts: [
          { type: 'tool-call', id: key, name: post.label ?? 'update', state: 'output-available', arguments: '{}' },
          { type: 'tool-result', toolCallId: key, content: post.text, state: 'output-available' },
          { type: 'text', content: post.text },
        ],
      },
    ];
    const attachments: Record<string, DBAssistantAttachment> = {
      [key]: { images: post.image ? [{ data: post.image.data, mimeType: post.image.mimeType }] : [], references: post.references ?? [] },
    };
    const count = await this.threads.append(post.userId, post.threadId, post.title ?? post.text.slice(0, 60), messages, attachments);
    this.signalThread(post.userId, post.threadId, count);
  }

  public async deliver(
    user: DBUser,
    input: {
      title: string;
      prompt: string;
      text: string;
      image?: ToolImage;
      attachments: Record<string, DBAssistantAttachment>;
      push: boolean;
      thread: boolean;
      tag: string;
    },
  ): Promise<void> {
    if (input.thread) {
      const now = Date.now();
      const messages = [
        { id: `${now}-user`, role: 'user', parts: [{ type: 'text', content: input.prompt }] },
        { id: `${now}-assistant`, role: 'assistant', parts: [{ type: 'text', content: input.text }] },
      ];
      const threadId = await this.threads.create(user._id, input.title, messages, input.attachments);
      this.signalThread(user._id, threadId, messages.length);
    }
    if (input.push) {
      const manager = container.resolve<ProxyServer>('proxy').notificationManager;
      const devices = await manager.listAllDevices(user._id, user.role);
      const targets = devices.filter((device) => device.ownerUserId === user._id).map((device) => device.id);
      if (!targets.length) throw new Error('The user has no notification devices');
      const body = input.text.length > PUSH_BODY_MAX ? `${input.text.slice(0, PUSH_BODY_MAX - 1)}…` : input.text;
      await manager.notify({
        notification: {
          title: input.title,
          body,
          severity: Severity.Info,
          thumbnail: input.image ? new Uint8Array(Buffer.from(input.image.data, 'base64')) : undefined,
          tag: input.tag,
        },
        source: { kind: 'system', id: 'assistant' },
        targets,
      });
    }
  }

  private signalThread(userId: string, threadId: string, messageCount: number): void {
    try {
      container.resolve<SocketService>('socketService').io.of('/notifications').to(`user:${userId}`).emit('assistant-thread', { threadId, messageCount });
    } catch (error: any) {
      this.logger.warn(`Assistant: could not signal the thread update: ${error.message}`);
    }
  }

  public runOwner(runId: string): string | undefined {
    return this.runs.get(runId)?.userId;
  }

  public cancelRun(runId: string, userId: string): boolean {
    const run = this.runs.get(runId);
    if (run?.userId !== userId || run.finishedAt) return false;
    run.abort.abort();
    return true;
  }

  public async hydrate(userId: string, threadId: string): Promise<AssistantHydration> {
    const persistence = lmdbPersistence(this.dbs, this.threads, userId);
    const active = await persistence.stores.runs.findActiveRun(threadId);
    const thread = this.threads.get(userId, threadId);
    const pending = await persistence.stores.interrupts.listPending(threadId);
    const live = active ? this.runs.get(active.runId) : undefined;
    const alive = live ? live.finishedAt === undefined : false;

    const open = [];
    for (const record of pending) {
      if (!alive && isClientToolInterrupt(record.payload)) await persistence.stores.interrupts.cancel(record.interruptId);
      else open.push(record);
    }

    return {
      messages: (thread?.messages ?? []) as UIMessage[],
      attachments: thread?.attachments ?? {},
      activeRun: active && alive ? { runId: active.runId } : null,
      interrupts: open[0] ? { runId: open[0].runId, pending: open.map((record) => record.payload as unknown as Interrupt) } : null,
    };
  }

  public runningRun(threadId: string): string | undefined {
    for (const [runId, run] of this.runs) if (run.threadId === threadId && !run.finishedAt) return runId;
    return undefined;
  }

  public async forgetUser(userId: string): Promise<void> {
    await this.scheduler.removeAll(userId);
    await this.threads.removeAll(userId);
    await this.profiles.removeAll(userId);
    await this.usage.removeAll(userId);
    await this.memory.removeAll(userId);
  }

  public access(pluginId: string): AssistantAccess {
    const entry = this.pluginModel(pluginId);
    return { allowed: entry !== undefined, model: entry?.model ?? null, vision: entry?.capabilities?.vision ?? null, language: this.settings().language };
  }

  public async ask(request: AssistantAskRequest): Promise<AssistantAskResult> {
    const settings = this.settings();
    const entry = this.pluginModel(request.pluginId);
    if (!entry) return { ok: false, reason: 'not_allowed', message: `Plugin ${request.pluginId} may not use the assistant model, allow it under Settings, Assistant` };
    if (!settings.enabled || !entryConfigured(entry)) return { ok: false, reason: 'unconfigured', message: 'The assistant model is not configured' };

    const release = await this.askSlot(request.pluginId);
    const timeoutMs = Math.min(Math.max(request.timeoutMs ?? ASK_TIMEOUT_MS, 1000), ASK_TIMEOUT_MAX_MS);
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    const stats = newStats();
    const model = this.modelSettings(settings, entry);

    const images =
      entry.capabilities?.vision !== false
        ? (request.images ?? []).map((img) => ({ type: 'image', source: { type: 'data', value: Buffer.from(img.data).toString('base64'), mimeType: img.mimeType } }))
        : [];

    const base = {
      adapter: createAdapter(model, this.decryptKey(entry)),
      systemPrompts: request.system ? [request.system] : [],
      messages: [{ role: 'user', content: [{ type: 'text', content: request.prompt }, ...images] }],
      modelOptions: modelOptionsFor(model) as never,
      middleware: [countUsage(stats)],
      abortController: abort,
    };

    try {
      if (request.outputSchema) {
        const json = await (chat({ ...base, outputSchema: request.outputSchema } as never) as unknown as Promise<unknown>);
        return { ok: true, text: JSON.stringify(json), json, usage: { promptTokens: stats.promptTokens, completionTokens: stats.completionTokens } };
      }

      let text = '';
      for await (const chunk of chat({ ...base, agentLoopStrategy: maxIterations(1) } as never) as AsyncIterable<StreamChunk>) {
        if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) text += chunk.delta ?? '';
        else if (chunk.type === EventType.RUN_ERROR) throw new Error(chunk.message);
      }

      return { ok: true, text: text.trim(), usage: { promptTokens: stats.promptTokens, completionTokens: stats.completionTokens } };
    } catch (error: unknown) {
      return { ok: false, reason: abort.signal.aborted ? 'timeout' : 'error', message: describeError(error) };
    } finally {
      clearTimeout(timer);
      release();
      this.usage
        .record(`plugin:${request.pluginId}`, usageEvent(model, stats))
        .catch((error: any) => this.logger.warn(`Assistant: could not record usage: ${error.message}`));
    }
  }

  public encryptKey(apiKey: string): DBAssistantModel['apiKey'] {
    return encryptPassword(apiKey, this.configService.SECRETS.jwtAccessKey);
  }

  public async test(entry: Pick<DBAssistantModel, 'provider' | 'baseURL' | 'model' | 'apiKey'>, rawKey?: string | null): Promise<AssistantTestResult> {
    const started = Date.now();
    const model = entry.model.trim();
    if (!model) return { ok: false, toolCalling: false, vision: null, latencyMs: 0, model, error: 'No model configured' };

    const apiKey = rawKey ?? this.decryptKey(entry);
    if (providerNeedsKey(entry.provider) && !apiKey) {
      return { ok: false, toolCalling: false, vision: null, latencyMs: 0, model, error: 'This provider needs an API key' };
    }

    const adapter = createAdapter({ ...entry, model }, apiKey);
    let toolCalled = false;
    const probe = toolDefinition({
      name: 'assistant_probe',
      description: 'Echo the given number. Call it exactly once when asked.',
      inputSchema: zod.object({ value: zod.number() }),
    }).server(({ value }) => {
      toolCalled = true;
      return { echoed: value };
    });

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TEST_TIMEOUT_MS);

    try {
      await this.drain(
        chat({
          adapter,
          systemPrompts: ['You are a connectivity probe. Follow the instruction literally.'],
          messages: [{ role: 'user', content: 'Call the tool assistant_probe with value 42, then answer with the single word OK.' }],
          tools: [probe],
          agentLoopStrategy: maxIterations(3),
          abortController: abort,
        }),
      );
    } catch (error: any) {
      clearTimeout(timer);
      return { ok: false, toolCalling: false, vision: null, latencyMs: Date.now() - started, model, error: describeError(error) };
    }

    let vision: boolean | null = null;

    try {
      await this.drain(
        chat({
          adapter,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', content: 'Answer with one word: what color is this image?' },
                { type: 'image', source: { type: 'data', value: PROBE_IMAGE, mimeType: 'image/png' } },
              ],
            },
          ],
          agentLoopStrategy: maxIterations(1),
          abortController: abort,
        }),
      );
      vision = true;
    } catch {
      vision = false;
    }

    clearTimeout(timer);
    return { ok: true, toolCalling: toolCalled, vision, latencyMs: Date.now() - started, model };
  }

  public async models(entry: Pick<DBAssistantModel, 'provider' | 'baseURL' | 'apiKey'>, rawKey?: string | null): Promise<AssistantModelsResult> {
    try {
      const models = await listModels(entry, rawKey ?? this.decryptKey(entry));
      return { models: Array.from(new Set(models)).sort((a, b) => a.localeCompare(b)) };
    } catch (error: any) {
      return { models: [], error: describeError(error) };
    }
  }

  public async run(request: AssistantRunRequest): Promise<Response> {
    const settings = this.settings();
    if (!settings.enabled) throw new Error('The assistant is disabled');
    if (this.status(request.user.role).state !== 'ready') throw new Error('The assistant is not configured');

    const params = await chatParamsFromRequestBody(request.body);
    const forwarded = (params as { forwardedProps?: Record<string, unknown> }).forwardedProps ?? {};
    const entry = this.resolveModel(request.user, { modelId: pickString(forwarded.modelId), profileId: pickString(forwarded.profileId) })!;
    const model = this.modelSettings(settings, entry);
    const ctx: AssistantRunContext = {
      userId: request.user._id,
      role: request.user.role,
      language: pickString(forwarded.language) ?? request.language ?? settings.language ?? request.user.preferences?.language ?? 'en',
      timezone: pickString(forwarded.timezone) ?? request.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      sendImages: model.sendImages,
      authorization: request.authorization,
      visionMissing: entry.capabilities?.vision === false ? entry.name : undefined,
    };
    if (ctx.language === 'auto') ctx.language = 'en';
    ctx.uploads = extractUploads(params.messages);
    ctx.instructions = pickString(forwarded.instructions)?.slice(0, 2000);
    ctx.answers = new Map();
    ctx.calledTools = [];

    const persistence = lmdbPersistence(this.dbs, this.threads, ctx.userId);
    const openInterrupts = new Set<string>();
    for (const item of params.resume ?? []) {
      const record = await persistence.stores.interrupts.get(item.interruptId);
      if (record?.status === 'pending') openInterrupts.add(item.interruptId);
    }
    const resume = (params.resume ?? []).filter((item) => openInterrupts.has(item.interruptId));

    const adapter = withEmptyTurnRetry(createAdapter(model, this.decryptKey(entry)), () => this.logger.debug(EMPTY_TURN_LOG));
    const disabledGroups = new Set(Array.isArray(forwarded.disabledGroups) ? forwarded.disabledGroups.filter((group) => typeof group === 'string') : []);
    if (!settings.terminalEnabled) disabledGroups.add(TERMINAL_GROUP);
    const available = entry.capabilities?.toolCalling === false ? [] : this.registry.toolsFor(ctx.role).filter((tool) => !disabledGroups.has(toolGroup(tool)));
    const tools = resume.length ? available.map((tool) => (tool.lazy ? { ...tool, lazy: false } : tool)) : available;
    const thread = await this.threads.ensure(request.user._id, params.threadId || randomUUID(), params.messages);
    ctx.threadId = thread._id;
    await this.storeUploads(ctx, thread._id, params.messages.length - 1);
    const abortController = new AbortController();
    request.signal?.addEventListener('abort', () => abortController.abort(), { once: true });
    const stats = newStats();
    warmPrices(model.provider);
    const runId = params.runId ?? randomUUID();
    this.runs.set(runId, { userId: ctx.userId, threadId: thread._id, abort: abortController });

    const stream = chat({
      adapter,
      messages: params.messages,
      threadId: thread._id,
      runId,
      parentRunId: params.parentRunId,
      ...(resume.length ? { resume } : {}),
      tools,
      interrupts: [ASK_USER_INTERRUPT],
      context: ctx,
      systemPrompts: [...cachedPrompts(buildSystemPrompt(ctx, this.promptFacts(request.user)), model.provider), describeUploads(ctx.uploads, ctx.sendImages)].filter(
        Boolean,
      ),
      agentLoopStrategy: maxIterations(settings.maxIterations + 1),
      lazyToolsConfig: { includeDescription: 'first-sentence' },
      modelOptions: modelOptionsFor(model) as never,
      middleware: [
        withPersistence(persistence),
        settings.memoryEnabled ? this.memoryMiddleware : NO_MIDDLEWARE,
        withCompaction({
          maxTokens: settings.contextTokens,
          strategy: composeStrategies(clearToolResults({ keepRecentToolResults: 6 }), evictOldest({ keepRecentTokens: Math.floor(settings.contextTokens / 2) })),
        }),
        this.runMiddleware(model, ctx, thread._id, params.messages, stats),
        toolCacheMiddleware({ ttl: TOOL_CACHE_TTL_MS, toolNames: CACHED_TOOLS }),
        secretGuard(this.logger),
      ],
      abortController,
    });

    const attachments: Record<string, DBAssistantAttachment> = {};
    const observed = this.collectAttachments(
      stream as AsyncIterable<StreamChunk>,
      attachments,
      ctx.userId,
      thread._id,
      () => {
        const event = usageEvent(model, stats);
        this.usage.record(ctx.userId, event).catch((error: any) => this.logger.warn(`Assistant: could not record usage: ${error.message}`));
        return event;
      },
      () => {
        const run = this.runs.get(runId);
        if (run) run.finishedAt = Date.now();
        setTimeout(() => this.runs.delete(runId), REPLAY_RETENTION_MS).unref();
      },
    );
    return toServerSentEventsResponse(observed, { abortController, ...(request.durability ? { durability: { adapter: request.durability } } : {}) });
  }

  public async runMcp(request: FastifyRequest, reply: FastifyReply, opts: { user: DBUser; authorization?: string; language?: string; timezone?: string }): Promise<void> {
    const settings = this.settings();
    const ctx: AssistantRunContext = {
      userId: opts.user._id,
      role: opts.user.role,
      language: opts.language ?? settings.language ?? preferredLanguage(opts.user) ?? 'en',
      timezone: opts.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      sendImages: true,
      authorization: opts.authorization,
    };
    await this.mcp.handle(request, reply, ctx, settings.mcpWrites);
  }

  public async runPrompt(
    user: DBUser,
    prompt: string,
    opts: { timezone?: string; language?: string; image?: ToolImage; instructions?: string; profile?: DBAssistantProfile },
  ): Promise<{ text: string; image?: ToolImage; attachments: Record<string, DBAssistantAttachment> }> {
    const settings = this.settings();
    if (!settings.enabled || this.status(user.role).state !== 'ready') throw new Error('The assistant is not ready');
    const entry = this.resolveModel(user, { profileId: opts.profile?._id })!;
    const model = this.modelSettings(settings, entry);

    const ctx: AssistantRunContext = {
      userId: user._id,
      role: user.role,
      language: opts.language ?? settings.language ?? preferredLanguage(user) ?? 'en',
      timezone: opts.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      sendImages: model.sendImages,
    };

    const disabledGroups = new Set(opts.profile?.disabledGroups ?? []);
    const tools =
      entry.capabilities?.toolCalling === false
        ? []
        : this.registry.toolsFor(ctx.role).filter((tool) => !tool.needsApproval && !isBrowserTool(tool) && !disabledGroups.has(toolGroup(tool)));
    const systemPrompts = [
      ...cachedPrompts(buildSystemPrompt(ctx, this.promptFacts(user)), model.provider),
      // prettier-ignore
      'This run is scheduled and unattended: nobody reads along and nobody can confirm anything. ' +
      'Answer completely in one go, as a report the user reads later on the phone. No questions back, no markdown headings.',
      ...(opts.profile?.instructions.trim() ? [opts.profile.instructions.trim()] : []),
      ...(opts.instructions ? [opts.instructions] : []),
    ];
    const parts =
      opts.image && ctx.sendImages
        ? [
            { type: 'text', content: prompt },
            { type: 'image', source: { type: 'data', value: opts.image.data, mimeType: opts.image.mimeType } },
          ]
        : [{ type: 'text', content: opts.image ? `${prompt}\n(A picture was attached but images are not sent to the model.)` : prompt }];

    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), 5 * 60_000);
    let text = '';
    const attachments: Record<string, DBAssistantAttachment> = {};
    const stats = newStats();

    try {
      const stream = chat({
        adapter: withEmptyTurnRetry(createAdapter(model, this.decryptKey(entry)), () => this.logger.debug(EMPTY_TURN_LOG)),
        messages: [{ id: `${Date.now()}-user`, role: 'user', parts: parts as never }],
        tools,
        context: ctx,
        systemPrompts,
        agentLoopStrategy: maxIterations(settings.maxIterations),
        modelOptions: modelOptionsFor(model) as never,
        middleware: [countUsage(stats)],
        abortController,
      });

      for await (const chunk of stream as AsyncIterable<StreamChunk>) {
        if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) text += chunk.delta ?? '';
        else if (chunk.type === EventType.RUN_ERROR) throw new Error(chunk.message);
        else collectAttachment(chunk, attachments);
      }
    } finally {
      clearTimeout(timer);
      this.usage.record(user._id, usageEvent(model, stats)).catch((error: any) => this.logger.warn(`Assistant: could not record usage: ${error.message}`));
    }

    const image = Object.values(attachments).flatMap((entry) => entry.images)[0];
    return { text: text.trim(), image, attachments };
  }

  public async search(user: DBUser, text: string, opts: { language?: string; timezone?: string }): Promise<AssistantSearchResult> {
    const settings = this.settings();
    if (!settings.enabled || this.status(user.role).state !== 'ready') throw new Error('The assistant is not ready');
    const entry = this.resolveModel(user)!;
    const model = this.modelSettings(settings, entry);

    const rooms = new RoomsService();
    const cameras = new CamerasService().list().map((camera) => ({ id: camera._id, name: camera.name, room: rooms.label(camera.roomId) ?? camera.room ?? undefined }));
    const ctx: AssistantRunContext = {
      userId: user._id,
      role: user.role,
      language: opts.language ?? settings.language ?? preferredLanguage(user) ?? 'en',
      timezone: opts.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      sendImages: false,
    };
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), SEARCH_TIMEOUT_MS);
    const stats = newStats();
    try {
      const output = await chat({
        adapter: createAdapter(model, this.decryptKey(entry)),
        systemPrompts: [searchPrompt(cameras, ctx.language === 'auto' ? 'en' : ctx.language, ctx.timezone)],
        messages: [{ role: 'user', content: text }],
        outputSchema: SEARCH_SCHEMA,
        context: ctx,
        middleware: [countUsage(stats)],
        abortController,
      });
      return toSearchResult(output, cameras);
    } finally {
      clearTimeout(timer);
      this.usage.record(user._id, usageEvent(model, stats)).catch((error: any) => this.logger.warn(`Assistant: could not record usage: ${error.message}`));
    }
  }

  private runMiddleware(
    settings: AssistantSettings,
    runCtx: AssistantRunContext,
    threadId: string,
    incoming: (UIMessage | ModelMessage)[],
    stats: AssistantRunStats,
  ): ChatMiddleware<AssistantRunContext, typeof ASK_USER_INTERRUPT> {
    const log = this.logger;
    const userId = runCtx.userId;

    return {
      name: 'camera.ui-assistant',
      onInterruptBoundary: (ctx) => {
        if (ctx.phase !== 'beforeTools') return undefined;
        if (ctx.parentRunId && ctx.iteration === 0) return undefined;
        const pending = pendingQuestions(ctx.messages).filter((question) => !runCtx.answers?.has(question.toolCallId));
        if (!pending.length) return undefined;
        return {
          interrupts: pending.map((question) =>
            ASK_USER_INTERRUPT.interrupt({ key: question.toolCallId, reason: 'clarification', message: question.question, payload: question }),
          ),
        };
      },
      onInterruptResolution: (_ctx, resumed) => {
        for (const item of resumed.for(ASK_USER_INTERRUPT)) {
          const payload = item.request.payload as AssistantQuestion;
          runCtx.answers?.set(payload.toolCallId, item.status === 'resolved' ? String((item.response as { answer?: string }).answer ?? '') : '');
        }
        return undefined;
      },
      onConfig: (ctx, config) => {
        const exhausted = ctx.iteration >= settings.maxIterations || stats.toolCalls >= settings.maxToolCalls;
        const providerMessages = messagesForModel(config.providerMessages ?? config.messages, settings.sendImages);
        if (!exhausted || !config.tools.length) return { providerMessages };
        return { providerMessages, tools: [], systemPrompts: [...config.systemPrompts, FINAL_TURN_PROMPT] };
      },
      onBeforeToolCall: (_ctx, hook) => {
        stats.toolCalls += 1;
        if (stats.toolCalls > settings.maxToolCalls) {
          return { type: 'skip', result: { error: `Tool call budget of ${settings.maxToolCalls} per run is used up, answer with what you have.` } };
        }
        log.debug(`Assistant tool call ${hook.toolName} ${JSON.stringify(hook.args ?? {}).slice(0, 300)}`);
        return undefined;
      },
      onAfterToolCall: (_ctx, info) => {
        runCtx.calledTools?.push(info.toolName);
        log.debug(`Assistant tool ${info.toolName} ${info.ok ? 'ok' : 'failed'} in ${info.duration}ms`);
      },
      onUsage: countUsage(stats).onUsage,
      onFinish: async (ctx, info) => {
        log.debug(
          // prettier-ignore
          `Assistant run finished (${info.finishReason ?? 'unknown'}) after ${Date.now() - stats.startedAt}ms, ${stats.toolCalls} tool calls, ` +
          `${stats.promptTokens} prompt / ${stats.completionTokens} completion tokens in ${stats.iterations} turns`,
        );
        const ui = ctx.messages.length ? modelMessagesToUIMessages([...ctx.messages]) : [];
        await this.threads
          .saveMessages(userId, threadId, ui.length ? ui : incoming, incoming)
          .catch((error: any) => log.warn(`Assistant: could not store thread: ${error.message}`));
      },
      onError: (_ctx, info) => {
        log.warn(`Assistant run failed: ${describeError(info.error)}`);
      },
    };
  }

  private async extractFacts(userId: string, turn: MemoryTurn, existing: string[]): Promise<MemoryChange> {
    const entry = this.resolveModel({ _id: userId, role: new UsersService().findById(userId)?.role ?? 'user' });
    if (!entry) return { add: [], remove: [] };
    const model = this.modelSettings(this.settings(), entry);
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), EXTRACT_TIMEOUT_MS);
    let text = '';
    try {
      const stream = chat({
        adapter: createAdapter(model, this.decryptKey(entry)),
        systemPrompts: [EXTRACT_PROMPT],
        messages: [
          {
            role: 'user',
            content: JSON.stringify({ existing, user: turn.user.slice(0, EXTRACT_MAX_CHARS) }),
          },
        ],
        agentLoopStrategy: maxIterations(1),
        abortController: abort,
      });
      for await (const chunk of stream as AsyncIterable<StreamChunk>) {
        if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) text += chunk.delta ?? '';
        else if (chunk.type === EventType.RUN_ERROR) throw new Error(chunk.message);
      }
    } finally {
      clearTimeout(timer);
    }
    const parsed = JSON.parse(text.replace(/^[\s\S]*?(\{)/, '$1').replace(/\}[\s\S]*$/, '}')) as Partial<MemoryChange>;
    const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []);
    return { add: strings(parsed.add).slice(0, 3), remove: strings(parsed.remove) };
  }

  private async storeUploads(ctx: AssistantRunContext, threadId: string, lastIndex: number): Promise<void> {
    const attachments: Record<string, DBAssistantAttachment> = {};
    for (const upload of ctx.uploads ?? []) {
      if (upload.kind !== 'image' || upload.tooLarge || upload.messageIndex !== lastIndex) continue;
      attachments[upload.key] = { images: [{ data: upload.data.toString('base64'), mimeType: upload.mimeType, caption: upload.id }], references: [] };
    }
    if (!Object.keys(attachments).length) return;
    await this.threads.addAttachments(ctx.userId, threadId, attachments).catch((error: any) => this.logger.warn(`Assistant: could not store uploads: ${error.message}`));
  }

  private async *collectAttachments(
    stream: AsyncIterable<StreamChunk>,
    attachments: Record<string, DBAssistantAttachment>,
    userId: string,
    threadId: string,
    usage: () => AssistantUsageEvent,
    done: () => void,
  ): AsyncIterable<StreamChunk> {
    try {
      for await (const chunk of stream) {
        collectAttachment(chunk, attachments);
        if (chunk.type === EventType.RUN_FINISHED && finishReasonOf(chunk) !== 'tool_calls') {
          yield { type: EventType.CUSTOM, name: USAGE_EVENT, value: usage(), timestamp: Date.now() };
        }
        yield chunk;
      }
    } finally {
      done();
      if (Object.keys(attachments).length) {
        await this.threads
          .addAttachments(userId, threadId, attachments)
          .catch((error: any) => this.logger.warn(`Assistant: could not store attachments: ${error.message}`));
      }
    }
  }

  private promptFacts(user: DBUser) {
    const api = container.resolve<CameraUiAPI>('api');
    const rooms = new RoomsService();
    const cameras = new CamerasService().list().map((camera) => ({
      name: camera.name,
      room: rooms.label(camera.roomId) ?? camera.room ?? undefined,
      online: api.getCamera(camera._id)?.connected ?? false,
    }));
    const plugins = new PluginsService()
      .listPlugins()
      .filter((p) => p.worker.isRunning())
      .map((p) => p.displayName);

    return {
      instanceName: hostname(),
      userName: user.username,
      cameras,
      plugins,
      pluginToolCount: this.registry.pluginToolCount,
      external: this.registry
        .externalStatus(this.externalServers(this.settings()))
        .filter((server) => server.state === 'connected' && server.toolCount > 0)
        .map((server) => server.name),
      extra: this.settings().systemPromptExtra,
      terminal: this.settings().terminalEnabled,
    };
  }

  private externalServers(settings: DBAssistant): ExternalServer[] {
    return settings.mcpServers.map((server) => ({ ...server, plainToken: this.decryptSecret(server) }));
  }

  private decryptSecret(server: DBAssistantMcpServer): string | null {
    if (!server.token) return null;
    try {
      return decryptPassword(server.token.encrypted, server.token.iv, this.configService.SECRETS.jwtAccessKey);
    } catch {
      this.logger.warn(`Assistant: stored token for ${server.name} cannot be decrypted, enter it again`);
      return null;
    }
  }

  private pluginModel(pluginId: string): DBAssistantModel | undefined {
    const settings = this.settings();
    const access = settings.plugins.find((row) => row.pluginId === pluginId);
    return access ? (settings.models.find((entry) => entry._id === access.modelId) ?? defaultEntry(settings)) : undefined;
  }

  private modelSettings(settings: AssistantSettings, entry: DBAssistantModel): AssistantSettings {
    return { ...settings, provider: entry.provider, baseURL: entry.baseURL, apiKey: entry.apiKey, model: entry.model, sendImages: sendsImages(entry) };
  }

  private askSlot(pluginId: string): Promise<() => void> {
    const slot = this.askSlots.get(pluginId) ?? { active: 0, waiters: [] };
    this.askSlots.set(pluginId, slot);
    const release = (): void => {
      slot.active -= 1;
      slot.waiters.shift()?.();
    };
    if (slot.active < ASK_CONCURRENCY) {
      slot.active += 1;
      return Promise.resolve(release);
    }
    return new Promise((resolve) => {
      slot.waiters.push(() => {
        slot.active += 1;
        resolve(release);
      });
    });
  }

  private decryptKey(entry: Pick<DBAssistantModel, 'apiKey'>): string | null {
    if (!entry.apiKey) return null;
    try {
      return decryptPassword(entry.apiKey.encrypted, entry.apiKey.iv, this.configService.SECRETS.jwtAccessKey);
    } catch {
      this.logger.warn('Assistant: stored API key cannot be decrypted, enter it again');
      return null;
    }
  }

  private async drain(stream: AsyncIterable<StreamChunk>): Promise<void> {
    for await (const chunk of stream) {
      if (chunk.type === EventType.RUN_ERROR) throw new Error(chunk.message);
    }
  }
}

function finishReasonOf(chunk: StreamChunk): string | undefined {
  return (chunk as { metadata?: { tanstack?: { finishReason?: string } } }).metadata?.tanstack?.finishReason;
}

function countUsage(stats: AssistantRunStats): Pick<Required<ChatMiddleware<AssistantRunContext>>, 'name' | 'onUsage'> {
  return {
    name: 'camera.ui-usage',
    onUsage: (_ctx, usage) => {
      stats.iterations += 1;
      stats.promptTokens += usage.promptTokens ?? 0;
      stats.completionTokens += usage.completionTokens ?? 0;
      stats.cachedTokens += usage.promptTokensDetails?.cachedTokens ?? 0;
      stats.reasoningTokens += usage.completionTokensDetails?.reasoningTokens ?? 0;
    },
  };
}

function pendingQuestions(messages: readonly ModelMessage[]): AssistantQuestion[] {
  const last = [...messages].reverse().find((message) => message.role === 'assistant') as
    { toolCalls?: { id: string; function: { name: string; arguments: string } }[] } | undefined;
  const questions: AssistantQuestion[] = [];
  for (const call of last?.toolCalls ?? []) {
    if (call.function.name !== 'ask_user') continue;
    try {
      const args = JSON.parse(call.function.arguments || '{}') as Partial<AssistantQuestion>;
      if (!args.question) continue;
      questions.push({
        toolCallId: call.id,
        question: args.question,
        kind: args.kind ?? 'choice',
        options: Array.isArray(args.options) ? args.options.slice(0, 8) : undefined,
      });
    } catch {
      // unparsable arguments fail in the tool itself
    }
  }
  return questions;
}

function newStats(): AssistantRunStats {
  return { startedAt: Date.now(), promptTokens: 0, completionTokens: 0, cachedTokens: 0, reasoningTokens: 0, iterations: 0, toolCalls: 0 };
}

function usageEvent(settings: Pick<AssistantSettings, 'provider' | 'model'>, stats: AssistantRunStats): AssistantUsageEvent {
  const { startedAt, ...totals } = stats;
  return {
    ...totals,
    durationMs: Date.now() - startedAt,
    provider: settings.provider,
    model: settings.model,
    costUsd: estimateCost(settings.provider, settings.model, stats),
  };
}

function preferredLanguage(user: DBUser): string | undefined {
  const language = user.preferences?.language;
  return language && language !== 'auto' ? language : undefined;
}

function collectAttachment(chunk: StreamChunk, attachments: Record<string, DBAssistantAttachment>): void {
  if (chunk.type === EventType.CUSTOM) {
    const value = chunk.value as { toolCallId?: string | null; data?: string; mimeType?: string; caption?: string | null; kind?: string; id?: string } | undefined;
    const key = value?.toolCallId;
    if (!key) return;
    const entry = (attachments[key] ??= { images: [], references: [] });
    if (chunk.name === 'assistant.setting' && typeof (value as { setting?: unknown }).setting === 'string') {
      (entry.settings ??= []).push((value as { setting: string }).setting);
    } else if (chunk.name === 'assistant.notice' && typeof (value as { notice?: { model?: unknown } }).notice?.model === 'string') {
      (entry.notices ??= []).push((value as { notice: DBAssistantAttachmentNotice }).notice);
    } else if (chunk.name === 'assistant.card' && value && typeof (value as { card?: unknown }).card === 'object') {
      (entry.cards ??= []).push((value as { card: DBAssistantCard }).card);
    } else if (chunk.name === 'assistant.image' && typeof value.data === 'string') {
      entry.images.push({ data: value.data, mimeType: value.mimeType ?? 'image/jpeg', caption: value.caption ?? undefined });
    } else if (chunk.name === 'assistant.reference' && typeof value.id === 'string' && REFERENCE_KINDS.has(value.kind ?? '')) {
      const reference = value as {
        kind: DBAssistantAttachmentReference['kind'];
        id: string;
        label?: string | null;
        cameraId?: string | null;
        timestamp?: number | null;
        url?: string | null;
      };
      entry.references.push({
        kind: reference.kind,
        id: reference.id,
        label: reference.label ?? undefined,
        cameraId: reference.cameraId ?? undefined,
        timestamp: reference.timestamp ?? undefined,
        url: reference.url ?? undefined,
      });
    }
  } else if (chunk.type === EventType.TOOL_CALL_RESULT) {
    const images = imageParts(chunk.content);
    if (!images.length || !chunk.toolCallId) return;
    const entry = (attachments[chunk.toolCallId] ??= { images: [], references: [] });
    if (!entry.images.length) entry.images.push(...images);
  }
}

function imageParts(content: unknown): ToolImage[] {
  const parts = contentParts(content);
  if (!parts) return [];
  const images: ToolImage[] = [];
  for (const part of parts as { type?: string; source?: { type?: string; value?: string; mimeType?: string } }[]) {
    if (part?.type === 'image' && part.source?.type === 'data' && part.source.value) {
      images.push({ data: part.source.value, mimeType: part.source.mimeType ?? 'image/jpeg' });
    }
  }
  return images;
}

function cachedPrompts(prompts: string[], provider: string): SystemPrompt<never>[] {
  if (provider !== 'anthropic') return prompts;
  const [first, ...rest] = prompts;
  return [{ content: first, metadata: { cache_control: { type: 'ephemeral' } } } as unknown as SystemPrompt<never>, ...rest];
}

function modelsFor(models: DBAssistantModel[], role?: DBRoles): DBAssistantModel[] {
  return role === 'user' ? models.filter((entry) => entry.userAccess !== false) : models;
}

function isClientToolInterrupt(payload: unknown): boolean {
  const reason = (payload as { reason?: unknown } | undefined)?.reason;
  return typeof reason === 'string' && reason.includes('client_tool');
}

function defaultEntry(record: Pick<DBAssistant, 'models' | 'defaultModelId'>): DBAssistantModel | undefined {
  return record.models.find((entry) => entry._id === record.defaultModelId) ?? record.models[0];
}

function entryConfigured(entry: DBAssistantModel): boolean {
  return entry.model.trim().length > 0 && (!providerNeedsKey(entry.provider) || entry.apiKey !== null);
}

function sendsImages(entry: DBAssistantModel): boolean {
  return entry.sendImages && entry.capabilities?.vision !== false;
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? error.cause.message : typeof error.cause === 'string' ? error.cause : undefined;
    return cause && !error.message.includes(cause) ? `${error.message} (${cause})` : error.message;
  }
  if (typeof error === 'string') return error;
  return 'Unknown error';
}
