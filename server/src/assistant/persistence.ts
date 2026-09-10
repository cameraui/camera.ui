import { modelMessagesToUIMessages, uiMessageToModelMessages } from '@tanstack/ai';
import { defineAIPersistence } from '@tanstack/ai-persistence';

import type { ModelMessage, RunRecord, RunStore, UIMessage } from '@tanstack/ai';
import type { ChatPersistence, InterruptCommitEntry, InterruptRecord, InterruptStore, MessageStore, MetadataStore } from '@tanstack/ai-persistence';
import type { Database } from '../api/database/index.js';
import type { AssistantThreadStore } from './threads.js';

const KEY_END = '\uffff';

type StoredRun = RunRecord & { userId: string };
type StoredInterrupt = InterruptRecord & { userId: string };

export function lmdbPersistence(dbs: Database, threads: AssistantThreadStore, userId: string): ChatPersistence {
  const db = dbs.assistantStateDB;
  const range = (prefix: string) => Array.from(db.getRange({ start: prefix, end: `${prefix}${KEY_END}` }));
  const owned = <T extends { userId: string }>(record: T | undefined): T | null => (record && record.userId === userId ? record : null);

  const messages: MessageStore = {
    async loadThread(threadId) {
      const stored = (threads.get(userId, threadId)?.messages ?? []) as (UIMessage | ModelMessage)[];
      return stored.flatMap((message) => ('parts' in message ? uiMessageToModelMessages(message) : [message]));
    },
    async saveThread(threadId, model) {
      await threads.saveMessages(userId, threadId, modelMessagesToUIMessages(model), model);
    },
  };

  const runs: RunStore = {
    async createOrResume(input) {
      let record!: StoredRun;
      await db.transaction(() => {
        const existing = owned(db.get(`run/${input.runId}`) as StoredRun | undefined);
        if (existing) {
          record = existing;
          return;
        }
        record = { runId: input.runId, threadId: input.threadId, status: input.status ?? 'running', startedAt: input.startedAt, userId };
        db.put(`run/${input.runId}`, record);
        db.put(`runidx/${userId}/${input.threadId}/${input.runId}`, input.startedAt);
      });
      return stripUser(record);
    },
    async update(runId, patch) {
      await db.transaction(() => {
        const existing = owned(db.get(`run/${runId}`) as StoredRun | undefined);
        if (!existing) return;
        const next: Record<string, unknown> = { ...existing };
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) delete next[key];
          else next[key] = value;
        }
        db.put(`run/${runId}`, next);
      });
    },
    async get(runId) {
      const record = owned(db.get(`run/${runId}`) as StoredRun | undefined);
      return record ? stripUser(record) : null;
    },
    async findActiveRun(threadId) {
      const active = runsOf(threadId).filter((run) => run.status === 'running');
      active.sort((a, b) => b.startedAt - a.startedAt);
      return active[0] ?? null;
    },
    async listByThread(threadId) {
      return runsOf(threadId).sort((a, b) => a.startedAt - b.startedAt);
    },
  };

  function runsOf(threadId: string): RunRecord[] {
    const out: RunRecord[] = [];
    for (const { key } of range(`runidx/${userId}/${threadId}/`)) {
      const record = owned(db.get(`run/${key.slice(key.lastIndexOf('/') + 1)}`) as StoredRun | undefined);
      if (record) out.push(stripUser(record));
    }
    return out;
  }

  const interrupts: InterruptStore = {
    async create(record) {
      await db.transaction(() => {
        if (db.get(`int/${record.interruptId}`)) return;
        db.put(`int/${record.interruptId}`, { ...record, status: 'pending', userId });
        db.put(`intidx/${userId}/${record.threadId}/${record.runId}/${record.interruptId}`, record.requestedAt);
      });
    },
    async resolve(interruptId, response) {
      await settle([{ interruptId, status: 'resolved', response }], false);
    },
    async cancel(interruptId) {
      await settle([{ interruptId, status: 'cancelled' }], false);
    },
    async commitBatch(entries) {
      await settle(entries, true);
    },
    async get(interruptId) {
      const record = owned(db.get(`int/${interruptId}`) as StoredInterrupt | undefined);
      return record ? stripUser(record) : null;
    },
    async list(threadId) {
      return interruptsOf(`intidx/${userId}/${threadId}/`);
    },
    async listPending(threadId) {
      return interruptsOf(`intidx/${userId}/${threadId}/`).filter((record) => record.status === 'pending');
    },
    async listByRun(runId) {
      const run = owned(db.get(`run/${runId}`) as StoredRun | undefined);
      return run ? interruptsOf(`intidx/${userId}/${run.threadId}/${runId}/`) : [];
    },
    async listPendingByRun(runId) {
      const run = owned(db.get(`run/${runId}`) as StoredRun | undefined);
      return run ? interruptsOf(`intidx/${userId}/${run.threadId}/${runId}/`).filter((record) => record.status === 'pending') : [];
    },
  };

  function interruptsOf(prefix: string): InterruptRecord[] {
    const out: InterruptRecord[] = [];
    for (const { key } of range(prefix)) {
      const record = owned(db.get(`int/${key.slice(key.lastIndexOf('/') + 1)}`) as StoredInterrupt | undefined);
      if (record) out.push(stripUser(record));
    }
    return out.sort((a, b) => a.requestedAt - b.requestedAt);
  }

  async function settle(entries: readonly InterruptCommitEntry[], strict: boolean): Promise<void> {
    await db.transaction(() => {
      const seen = new Set<string>();
      const rows = entries.map((entry) => {
        if (strict && seen.has(entry.interruptId)) throw new Error(`Interrupt batch contains duplicate id: ${entry.interruptId}.`);
        seen.add(entry.interruptId);
        const existing = owned(db.get(`int/${entry.interruptId}`) as StoredInterrupt | undefined);
        if (strict && !existing) throw new Error(`Interrupt batch references missing id: ${entry.interruptId}.`);
        if (strict && existing?.status !== 'pending') throw new Error(`Interrupt batch references non-pending id: ${entry.interruptId}.`);
        return { entry, existing };
      });
      const resolvedAt = Date.now();
      for (const { entry, existing } of rows) {
        if (!existing) continue;
        const next: StoredInterrupt =
          entry.status === 'resolved' ? { ...existing, status: 'resolved', resolvedAt, response: entry.response } : { ...existing, status: 'cancelled', resolvedAt };
        db.put(`int/${entry.interruptId}`, next);
      }
    });
  }

  const metadata: MetadataStore = {
    async get(namespace, key) {
      const value = db.get(`meta/${userId}/${key}/${namespace}`);
      return value === undefined ? null : value;
    },
    async set(namespace, key, value) {
      await db.put(`meta/${userId}/${key}/${namespace}`, value);
    },
    async delete(namespace, key) {
      await db.remove(`meta/${userId}/${key}/${namespace}`);
    },
  };

  return defineAIPersistence({ stores: { messages, runs, interrupts, metadata } });
}

export async function abortStaleRuns(dbs: Database): Promise<number> {
  const db = dbs.assistantStateDB;
  const stale = Array.from(db.getRange({ start: 'run/', end: `run/${KEY_END}` })).filter(({ value }) => (value as StoredRun).status === 'running');
  if (!stale.length) return 0;
  await db.transaction(() => {
    for (const { key, value } of stale) {
      db.put(key, { ...(value as StoredRun), status: 'aborted', finishedAt: Date.now(), error: { message: 'Server restarted' } });
    }
  });
  return stale.length;
}

export function dropThreadState(dbs: Database, userId: string, threadId: string): void {
  const db = dbs.assistantStateDB;
  const prefix = `${userId}/${threadId}/`;
  for (const { key } of Array.from(db.getRange({ start: `runidx/${prefix}`, end: `runidx/${prefix}${KEY_END}` }))) {
    db.remove(`run/${key.slice(key.lastIndexOf('/') + 1)}`);
    db.remove(key);
  }
  for (const { key } of Array.from(db.getRange({ start: `intidx/${prefix}`, end: `intidx/${prefix}${KEY_END}` }))) {
    db.remove(`int/${key.slice(key.lastIndexOf('/') + 1)}`);
    db.remove(key);
  }
  for (const { key } of Array.from(db.getRange({ start: `meta/${prefix}`, end: `meta/${prefix}${KEY_END}` }))) db.remove(key);
}

function stripUser<T extends { userId: string }>(record: T): Omit<T, 'userId'> {
  const { userId: _owner, ...rest } = record;
  return rest;
}
