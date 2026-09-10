import { randomUUID } from 'node:crypto';
import { container } from 'tsyringe';

import { UsersService } from './users.service.js';

import type { AssistantManager } from '../../assistant/manager.js';
import type { AssistantInfo, AssistantModelsResult, AssistantStatus, AssistantTestResult, AssistantThreadSummary, AssistantUsageRow } from '../../assistant/types.js';
import type { ProxyServer } from '../../rpc/index.js';
import type { Database } from '../database/index.js';
import type {
  DBAssistant,
  DBAssistantMemoryFact,
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
} from '../schemas/assistant.schema.js';

export class AssistantService {
  private dbs: Database;

  constructor() {
    this.dbs = container.resolve<Database>('dbs');
  }

  public info(role?: DBRoles): AssistantInfo {
    return this.manager.info(role);
  }

  public status(): AssistantStatus {
    return this.manager.status();
  }

  public async patch(patch: PatchAssistantInput): Promise<AssistantInfo> {
    await this.dbs.commit(this.dbs.assistantDB, 'assistant', (current) => this.mergeSettings(current ?? this.manager.settings(), patch));
    container.resolve<ProxyServer>('proxy').coreManager?.publishCoreManagerEvent('assistantModelChanged', { configured: this.manager.pluginModel().configured });
    if (patch.mcpServers) this.manager.reloadExternal();
    return this.manager.info();
  }

  public async test(patch: PatchAssistantInput): Promise<AssistantTestResult> {
    const settings = this.mergeSettings(this.manager.settings(), patch);
    return this.manager.test(settings, patch.apiKey ?? undefined);
  }

  public async models(patch: PatchAssistantInput): Promise<AssistantModelsResult> {
    const settings = this.mergeSettings(this.manager.settings(), patch);
    return this.manager.models(settings, patch.apiKey ?? undefined);
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
    return this.manager.usage.listAll().map((row) => ({ ...row, username: users.findById(row.userId)?.username }));
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
    const { apiKey, mcpServers, ...rest } = patch;

    return {
      ...current,
      ...rest,
      apiKey: apiKey === undefined ? current.apiKey : apiKey === null || apiKey === '' ? null : this.manager.encryptKey(apiKey),
      mcpServers:
        mcpServers === undefined
          ? current.mcpServers
          : mcpServers.map((entry) => {
              const existing = current.mcpServers.find((server) => server.id === entry.id);
              const token =
                entry.token === undefined ? (existing?.token ?? null) : entry.token === null || entry.token === '' ? null : this.manager.encryptKey(entry.token);
              return { id: entry.id ?? randomUUID(), name: entry.name, url: entry.url, token, enabled: entry.enabled, insecure: entry.insecure };
            }),
    };
  }
}
