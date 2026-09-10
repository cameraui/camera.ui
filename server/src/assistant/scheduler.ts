import { Severity } from '@camera.ui/sdk';
import { Cron } from 'croner';
import { randomUUID } from 'node:crypto';
import { container } from 'tsyringe';

import { UsersService } from '../api/services/users.service.js';

import type { Database } from '../api/database/index.js';
import type { DBAssistantAttachment, DBAssistantSchedule } from '../api/database/types.js';
import type { CreateAssistantScheduleInput, PatchAssistantScheduleInput } from '../api/schemas/assistant.schema.js';
import type { ProxyServer } from '../rpc/index.js';
import type { LoggerService } from '../services/logger/index.js';
import type { AssistantManager } from './manager.js';

const MAX_SCHEDULES_PER_USER = 20;

export const PUSH_BODY_MAX = 1500;

export function validateCron(expression: string, timezone?: string): string | undefined {
  try {
    const job = new Cron(expression, { timezone, paused: true });
    const next = job.nextRun();
    job.stop();
    return next ? undefined : 'The expression never fires';
  } catch (error: any) {
    return error?.message ?? 'Invalid cron expression';
  }
}

export class AssistantScheduler {
  private jobs = new Map<string, Cron>();
  private running = new Set<string>();
  private logger: LoggerService;
  private dbs: Database;

  constructor(private manager: AssistantManager) {
    this.logger = container.resolve<LoggerService>('logger');
    this.dbs = container.resolve<Database>('dbs');
  }

  public start(): void {
    for (const schedule of this.all()) this.arm(schedule);
  }

  public stop(): void {
    for (const job of this.jobs.values()) job.stop();
    this.jobs.clear();
  }

  public list(userId: string): DBAssistantSchedule[] {
    return this.all()
      .filter((schedule) => schedule.userId === userId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  public get(userId: string, scheduleId: string): DBAssistantSchedule | undefined {
    const schedule = this.dbs.assistantSchedulesDB.get(scheduleId);
    return schedule?.userId === userId ? schedule : undefined;
  }

  public nextRun(schedule: DBAssistantSchedule): number | null {
    const job = this.jobs.get(schedule._id);
    return job?.nextRun()?.getTime() ?? null;
  }

  public async create(userId: string, input: CreateAssistantScheduleInput): Promise<DBAssistantSchedule> {
    if (this.list(userId).length >= MAX_SCHEDULES_PER_USER) throw new Error(`At most ${MAX_SCHEDULES_PER_USER} scheduled prompts per user`);
    const timezone = input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const problem = validateCron(input.cron, timezone);
    if (problem) throw new Error(`Invalid schedule: ${problem}`);

    const now = Date.now();
    const schedule: DBAssistantSchedule = {
      _id: randomUUID(),
      userId,
      title: input.title,
      prompt: input.prompt,
      cron: input.cron,
      timezone,
      language: input.language,
      deliver: input.deliver,
      enabled: input.enabled,
      createdAt: now,
      updatedAt: now,
    };
    await this.dbs.assistantSchedulesDB.put(schedule._id, schedule);
    this.arm(schedule);
    return schedule;
  }

  public async update(userId: string, scheduleId: string, patch: PatchAssistantScheduleInput): Promise<DBAssistantSchedule | undefined> {
    const existing = this.get(userId, scheduleId);
    if (!existing) return undefined;

    const cron = patch.cron ?? existing.cron;
    const timezone = patch.timezone ?? existing.timezone;
    const problem = validateCron(cron, timezone);
    if (problem) throw new Error(`Invalid schedule: ${problem}`);

    await this.dbs.commit(this.dbs.assistantSchedulesDB, scheduleId, (current) =>
      current ? { ...current, ...patch, cron, timezone, updatedAt: Date.now() } : undefined,
    );
    const updated = this.get(userId, scheduleId);
    if (updated) this.arm(updated);
    return updated;
  }

  public async remove(userId: string, scheduleId: string): Promise<boolean> {
    if (!this.get(userId, scheduleId)) return false;
    this.disarm(scheduleId);
    await this.dbs.assistantSchedulesDB.remove(scheduleId);
    return true;
  }

  public async removeAll(userId: string): Promise<void> {
    const owned = this.list(userId);
    for (const schedule of owned) this.disarm(schedule._id);
    await this.dbs.assistantSchedulesDB.transaction(() => {
      for (const schedule of owned) this.dbs.assistantSchedulesDB.remove(schedule._id);
    });
  }

  public async runNow(userId: string, scheduleId: string): Promise<DBAssistantSchedule | undefined> {
    const schedule = this.get(userId, scheduleId);
    if (!schedule) return undefined;
    await this.run(schedule);
    return this.get(userId, scheduleId);
  }

  private all(): DBAssistantSchedule[] {
    return Array.from(this.dbs.assistantSchedulesDB.getRange({}))
      .map((entry) => entry.value)
      .filter((schedule): schedule is DBAssistantSchedule => !!schedule);
  }

  private arm(schedule: DBAssistantSchedule): void {
    this.disarm(schedule._id);
    if (!schedule.enabled) return;

    try {
      const job = new Cron(schedule.cron, { name: `assistant-${schedule._id}`, timezone: schedule.timezone, protect: true }, () => {
        this.run(schedule);
      });
      this.jobs.set(schedule._id, job);
      this.logger.debug(`Assistant: scheduled prompt "${schedule.title}" next at ${job.nextRun()?.toISOString() ?? 'never'}`);
    } catch (error: any) {
      this.logger.warn(`Assistant: scheduled prompt "${schedule.title}" has an invalid cron "${schedule.cron}": ${error.message}`);
    }
  }

  private disarm(scheduleId: string): void {
    this.jobs.get(scheduleId)?.stop();
    this.jobs.delete(scheduleId);
  }

  private async run(schedule: DBAssistantSchedule): Promise<void> {
    if (this.running.has(schedule._id)) return;
    this.running.add(schedule._id);

    const started = Date.now();
    try {
      // the schedule may have been edited since the job was armed, always read the stored version
      const current = this.dbs.assistantSchedulesDB.get(schedule._id) ?? schedule;
      const user = new UsersService().findById(current.userId);
      if (!user) throw new Error('The owner of this schedule no longer exists');

      const result = await this.manager.runPrompt(user, current.prompt, { timezone: current.timezone, language: current.language });
      if (!result.text.trim()) throw new Error('The model returned no text');

      if (current.deliver !== 'thread') await this.push(current, result.text, result.image);
      if (current.deliver !== 'push') await this.storeThread(current, result.text, result.attachments);

      await this.setLastRun(current._id, { at: started, status: 'success' });
      this.logger.debug(`Assistant: scheduled prompt "${current.title}" ran in ${Date.now() - started}ms`);
    } catch (error: any) {
      this.logger.warn(`Assistant: scheduled prompt "${schedule.title}" failed: ${error.message}`);
      await this.setLastRun(schedule._id, { at: started, status: 'error', message: String(error.message ?? error).slice(0, 300) });
    } finally {
      this.running.delete(schedule._id);
    }
  }

  private async push(schedule: DBAssistantSchedule, text: string, image?: { data: string; mimeType: string }): Promise<void> {
    const manager = container.resolve<ProxyServer>('proxy').notificationManager;
    const user = new UsersService().findById(schedule.userId);
    if (!user) return;

    const devices = await manager.listAllDevices(user._id, user.role);
    const targets = devices.filter((device) => device.ownerUserId === user._id).map((device) => device.id);
    if (!targets.length) throw new Error('The user has no notification devices');

    const body = text.length > PUSH_BODY_MAX ? `${text.slice(0, PUSH_BODY_MAX - 1)}…` : text;
    await manager.notify({
      notification: {
        title: schedule.title,
        body,
        severity: Severity.Info,
        thumbnail: image ? new Uint8Array(Buffer.from(image.data, 'base64')) : undefined,
        tag: `assistant-schedule:${schedule._id}`,
      },
      source: { kind: 'system', id: 'assistant' },
      targets,
    });
  }

  private async storeThread(schedule: DBAssistantSchedule, text: string, attachments: Record<string, DBAssistantAttachment>): Promise<void> {
    const now = Date.now();
    const dateLabel = new Date(now).toLocaleDateString('sv-SE', { timeZone: schedule.timezone });
    const messages = [
      { id: `${now}-user`, role: 'user', parts: [{ type: 'text', content: schedule.prompt }] },
      { id: `${now}-assistant`, role: 'assistant', parts: [{ type: 'text', content: text }] },
    ];
    await this.manager.threads.create(schedule.userId, `${schedule.title} ${dateLabel}`, messages, attachments);
  }

  private async setLastRun(scheduleId: string, lastRun: DBAssistantSchedule['lastRun']): Promise<void> {
    await this.dbs.commit(this.dbs.assistantSchedulesDB, scheduleId, (current) => (current ? { ...current, lastRun } : undefined));
  }
}
