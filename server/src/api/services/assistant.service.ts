import { randomUUID } from 'node:crypto';
import { container } from 'tsyringe';

import { PluginsService } from './plugins.service.js';
import { UsersService } from './users.service.js';

import type { AssistantManager } from '../../assistant/manager.js';
import type { AssistantInfo, AssistantModelsResult, AssistantStatus, AssistantTestResult, AssistantThreadSummary, AssistantUsageRow } from '../../assistant/types.js';
import type { ProxyServer } from '../../rpc/index.js';
import type { Database } from '../database/index.js';
import type {
  DBAssistant,
  DBAssistantMemoryFact,
  DBAssistantModel,
  DBAssistantProfile,
  DBAssistantSchedule,
  DBAssistantThread,
  DBAssistantUsageMonth,
  DBRoles,
} from '../database/types.js';
import type {
  CreateAssistantProfileInput,
  CreateAssistantScheduleInput,
  PatchAssistantInput,
  PatchAssistantProfileInput,
  PatchAssistantScheduleInput,
  TestAssistantInput,
} from '../schemas/assistant.schema.js';

const PLUGIN_OWNER = 'plugin:';

export class AssistantService {
  private dbs: Database;

  constructor() {
    this.dbs = container.resolve<Database>('dbs');
  }

  public info(role?: DBRoles): AssistantInfo {
    return this.manager.info(role);
  }

  public status(role?: DBRoles): AssistantStatus {
    return this.manager.status(role);
  }

  public async patch(patch: PatchAssistantInput): Promise<AssistantInfo> {
    const before = this.manager.settings();
    const merged = this.mergeSettings(before, patch);
    const retest = new Set((patch.models ?? []).flatMap((input) => (input.retest && input.id ? [input.id] : [])));
    const models = patch.models ? await this.testChanged(before.models, merged.models, retest) : merged.models;

    await this.dbs.commit(this.dbs.assistantDB, 'assistant', (current) => ({ ...(current ?? before), ...merged, models }));

    const removed = new Set(before.models.filter((entry) => !models.some((next) => next._id === entry._id)).map((entry) => entry._id));
    const fallback = this.manager.defaultModel();
    if (removed.size && fallback) await this.manager.profiles.reassignModel(removed, fallback._id);

    if (patch.models || patch.plugins || patch.defaultModelId !== undefined || patch.language !== undefined) {
      const proxy = container.resolve<ProxyServer>('proxy');
      for (const pluginId of new Set([...before.plugins, ...this.manager.settings().plugins].map((row) => row.pluginId))) {
        const access = this.manager.access(pluginId);
        proxy.coreManager?.publishCoreManagerEvent('assistantModelChanged', { pluginId, configured: access.allowed && access.model !== null });
      }
    }
    if (patch.mcpServers) this.manager.reloadExternal();
    return this.manager.info();
  }

  public async test(input: TestAssistantInput): Promise<AssistantTestResult> {
    return this.manager.test(this.entryFor(input), input.apiKey ?? undefined);
  }

  public async models(input: TestAssistantInput): Promise<AssistantModelsResult> {
    return this.manager.models(this.entryFor(input), input.apiKey ?? undefined);
  }

  public listThreads(userId: string): AssistantThreadSummary[] {
    return this.manager.threads.list(userId).map((thread) => {
      const runId = this.manager.runningRun(thread.id);
      return runId ? { ...thread, runId } : thread;
    });
  }

  public getThread(userId: string, threadId: string): DBAssistantThread | undefined {
    return this.manager.threads.get(userId, threadId);
  }

  public async renameThread(userId: string, threadId: string, title: string): Promise<DBAssistantThread | undefined> {
    return this.manager.threads.rename(userId, threadId, title);
  }

  public async replaceThreadMessages(userId: string, threadId: string, messages: unknown[]): Promise<DBAssistantThread | undefined> {
    return this.manager.threads.replaceMessages(userId, threadId, messages);
  }

  public async branchThread(userId: string, threadId: string, until: number): Promise<DBAssistantThread | undefined> {
    return this.manager.threads.branch(userId, threadId, until);
  }

  public async deleteThread(userId: string, threadId: string): Promise<boolean> {
    return this.manager.threads.remove(userId, threadId);
  }

  public async deleteAllThreads(userId: string): Promise<void> {
    return this.manager.threads.removeAll(userId);
  }

  public listSchedules(userId: string): (DBAssistantSchedule & { nextRun: number | null })[] {
    const scheduler = this.manager.scheduler;
    return scheduler.list(userId).map((schedule) => ({ ...schedule, nextRun: scheduler.nextRun(schedule) }));
  }

  public async createSchedule(userId: string, input: CreateAssistantScheduleInput): Promise<DBAssistantSchedule> {
    return this.manager.scheduler.create(userId, input);
  }

  public async updateSchedule(userId: string, scheduleId: string, patch: PatchAssistantScheduleInput): Promise<DBAssistantSchedule | undefined> {
    return this.manager.scheduler.update(userId, scheduleId, patch);
  }

  public async deleteSchedule(userId: string, scheduleId: string): Promise<boolean> {
    return this.manager.scheduler.remove(userId, scheduleId);
  }

  public async runSchedule(userId: string, scheduleId: string): Promise<DBAssistantSchedule | undefined> {
    return this.manager.scheduler.runNow(userId, scheduleId);
  }

  public listUsage(userId: string): DBAssistantUsageMonth[] {
    return this.manager.usage.list(userId);
  }

  public listUsageAll(): AssistantUsageRow[] {
    const users = new UsersService();
    const plugins = new PluginsService().listPlugins();
    return this.manager.usage.listAll().map((row) => {
      if (!row.userId.startsWith(PLUGIN_OWNER)) return { ...row, username: users.findById(row.userId)?.username };
      const pluginId = row.userId.slice(PLUGIN_OWNER.length);
      return { ...row, pluginName: plugins.find((plugin) => plugin.id === pluginId)?.displayName ?? pluginId };
    });
  }

  public listMemory(userId: string): DBAssistantMemoryFact[] {
    return this.manager.memory.list(userId);
  }

  public async deleteMemoryFact(userId: string, factId: string): Promise<boolean> {
    return this.manager.memory.remove(userId, factId);
  }

  public async deleteMemory(userId: string): Promise<void> {
    return this.manager.memory.removeAll(userId);
  }

  public listProfiles(userId: string): DBAssistantProfile[] {
    return this.manager.profiles.list(userId);
  }

  public listProfilesOf(username: string): DBAssistantProfile[] | undefined {
    const owner = new UsersService().findByName(username);
    return owner ? this.manager.profiles.list(owner._id) : undefined;
  }

  public async createProfile(userId: string, input: CreateAssistantProfileInput): Promise<DBAssistantProfile> {
    return this.manager.profiles.create(userId, input);
  }

  public async updateProfile(userId: string, profileId: string, patch: PatchAssistantProfileInput): Promise<DBAssistantProfile | undefined> {
    return this.manager.profiles.update(userId, profileId, patch);
  }

  public async deleteProfile(userId: string, profileId: string): Promise<boolean> {
    return this.manager.profiles.remove(userId, profileId);
  }

  private get manager(): AssistantManager {
    return container.resolve<AssistantManager>('assistantManager');
  }

  private mergeSettings(current: DBAssistant, patch: PatchAssistantInput): DBAssistant {
    const { models, plugins, mcpServers, ...rest } = patch;
    const nextModels =
      models === undefined
        ? current.models
        : models.map((input) => {
            const existing = current.models.find((entry) => entry._id === input.id);
            const source = input.copyKeyFrom ? current.models.find((entry) => entry._id === input.copyKeyFrom) : undefined;
            const apiKey =
              input.apiKey === undefined
                ? (source?.apiKey ?? existing?.apiKey ?? null)
                : input.apiKey === null || input.apiKey === ''
                  ? null
                  : this.manager.encryptKey(input.apiKey);
            return {
              _id: existing?._id ?? randomUUID(),
              name: input.name?.trim() ? input.name.trim() : input.model,
              provider: input.provider,
              baseURL: input.baseURL === undefined ? (existing?.baseURL ?? null) : input.baseURL?.trim() ? input.baseURL : null,
              apiKey,
              model: input.model,
              sendImages: input.sendImages ?? existing?.sendImages ?? false,
              userAccess: input.userAccess ?? existing?.userAccess ?? true,
              capabilities: existing?.capabilities ?? null,
            };
          });

    const wantedDefault = rest.defaultModelId === undefined ? current.defaultModelId : rest.defaultModelId;
    const defaultModelId = nextModels.some((entry) => entry._id === wantedDefault) ? wantedDefault : null;
    const fallbackId = (nextModels.find((entry) => entry._id === defaultModelId) ?? nextModels[0])?._id;

    const servers =
      mcpServers === undefined
        ? current.mcpServers
        : mcpServers.map((entry) => {
            const existing = current.mcpServers.find((server) => server.id === entry.id);
            const token =
              entry.token === undefined ? (existing?.token ?? null) : entry.token === null || entry.token === '' ? null : this.manager.encryptKey(entry.token);
            return {
              id: entry.id ?? randomUUID(),
              name: entry.name,
              url: entry.url,
              token,
              enabled: entry.enabled,
              insecure: entry.insecure,
              toolApproval: entry.toolApproval ?? existing?.toolApproval ?? {},
            };
          });

    return {
      ...current,
      ...rest,
      models: nextModels,
      defaultModelId,
      plugins: fallbackId
        ? (plugins ?? current.plugins).map((row) => (nextModels.some((entry) => entry._id === row.modelId) ? row : { ...row, modelId: fallbackId }))
        : [],
      mcpServers: servers,
    };
  }

  private async testChanged(before: DBAssistantModel[], next: DBAssistantModel[], retest: Set<string>): Promise<DBAssistantModel[]> {
    const out: DBAssistantModel[] = [];
    for (const entry of next) {
      const existing = before.find((candidate) => candidate._id === entry._id);
      const unchanged =
        existing?.provider === entry.provider &&
        existing.baseURL === entry.baseURL &&
        existing.model === entry.model &&
        existing.apiKey?.encrypted === entry.apiKey?.encrypted;
      if (unchanged && entry.capabilities && !retest.has(entry._id)) {
        out.push(entry);
        continue;
      }
      const result = await this.manager.test(entry);
      const capabilities = {
        toolCalling: result.toolCalling,
        vision: result.vision,
        testedAt: Date.now(),
        latencyMs: result.latencyMs,
        error: result.ok ? null : (result.error ?? 'failed'),
      };
      out.push({ ...entry, capabilities, sendImages: existing ? entry.sendImages : result.vision === true });
    }
    return out;
  }

  private entryFor(input: TestAssistantInput): Pick<DBAssistantModel, 'provider' | 'baseURL' | 'model' | 'apiKey'> {
    const existing = input.id ? this.manager.settings().models.find((entry) => entry._id === input.id) : undefined;
    const source = input.copyKeyFrom ? this.manager.settings().models.find((entry) => entry._id === input.copyKeyFrom) : undefined;
    return { provider: input.provider, baseURL: input.baseURL ?? existing?.baseURL ?? null, model: input.model, apiKey: source?.apiKey ?? existing?.apiKey ?? null };
  }
}
