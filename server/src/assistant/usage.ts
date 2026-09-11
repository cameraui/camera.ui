import { container } from 'tsyringe';

import type { Database } from '../api/database/index.js';
import type { DBAssistantUsageMonth } from '../api/database/types.js';
import type { AssistantUsageEvent } from './types.js';

const KEY_END = '\uffff';
const MONTHS_KEPT = 24;

export class AssistantUsageStore {
  private dbs: Database;

  constructor() {
    this.dbs = container.resolve<Database>('dbs');
  }

  public list(userId: string): DBAssistantUsageMonth[] {
    const prefix = `${userId}/`;
    return Array.from(this.dbs.assistantUsageDB.getRange({ start: prefix, end: `${prefix}${KEY_END}` }))
      .map((entry) => entry.value)
      .sort(byMonthOwnerModel)
      .slice(0, MONTHS_KEPT);
  }

  public listAll(): DBAssistantUsageMonth[] {
    return Array.from(this.dbs.assistantUsageDB.getRange({}))
      .map((entry) => entry.value)
      .sort(byMonthOwnerModel);
  }

  public async record(userId: string, event: AssistantUsageEvent): Promise<void> {
    const month = new Date().toISOString().slice(0, 7);
    const key = `${userId}/${month}/${event.provider}/${event.model}`;
    await this.dbs.commit(this.dbs.assistantUsageDB, key, (current) => ({
      userId,
      month,
      provider: event.provider,
      model: event.model,
      runs: (current?.runs ?? 0) + 1,
      promptTokens: (current?.promptTokens ?? 0) + event.promptTokens,
      completionTokens: (current?.completionTokens ?? 0) + event.completionTokens,
      cachedTokens: (current?.cachedTokens ?? 0) + event.cachedTokens,
      reasoningTokens: (current?.reasoningTokens ?? 0) + event.reasoningTokens,
      costUsd: Math.round(((current?.costUsd ?? 0) + (event.costUsd ?? 0)) * 1_000_000) / 1_000_000,
      updatedAt: Date.now(),
    }));
  }

  public async removeAll(userId: string): Promise<void> {
    const prefix = `${userId}/`;
    const keys = Array.from(this.dbs.assistantUsageDB.getKeys({ start: prefix, end: `${prefix}${KEY_END}` }));
    await this.dbs.assistantUsageDB.transaction(() => {
      for (const key of keys) this.dbs.assistantUsageDB.remove(key);
    });
  }
}

function byMonthOwnerModel(a: DBAssistantUsageMonth, b: DBAssistantUsageMonth): number {
  return b.month.localeCompare(a.month) || a.userId.localeCompare(b.userId) || a.model.localeCompare(b.model);
}
