import { randomUUID } from 'node:crypto';
import { container } from 'tsyringe';

import type { MemoryAdapter, MemoryTurn } from '@tanstack/ai-memory';
import type { Database } from '../api/database/index.js';
import type { DBAssistantMemoryFact } from '../api/database/types.js';
import type { LoggerService } from '../services/logger/index.js';

const MAX_FACTS_PER_USER = 60;
const KEY_END = '\uffff';
const MIN_TURN_CHARS = 12;

export interface MemoryChange {
  add: string[];
  remove: string[];
}

export type MemoryExtractor = (turn: MemoryTurn, existing: string[]) => Promise<MemoryChange>;

export class AssistantMemoryStore {
  private dbs: Database;

  constructor() {
    this.dbs = container.resolve<Database>('dbs');
  }

  public list(userId: string): DBAssistantMemoryFact[] {
    const prefix = `${userId}/`;
    return Array.from(this.dbs.assistantMemoryDB.getRange({ start: prefix, end: `${prefix}${KEY_END}` }))
      .map((entry) => entry.value)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  public async add(userId: string, texts: string[], source?: string): Promise<number> {
    const existing = this.list(userId);
    const known = new Set(existing.map((fact) => normalize(fact.text)));
    const fresh = texts.map((text) => text.trim()).filter((text) => text && !known.has(normalize(text)));
    if (!fresh.length) return 0;
    const now = Date.now();
    await this.dbs.assistantMemoryDB.transaction(() => {
      for (const text of fresh) {
        const id = randomUUID();
        this.dbs.assistantMemoryDB.put(`${userId}/${id}`, { _id: id, userId, text: text.slice(0, 200), source, createdAt: now, updatedAt: now });
      }
      const overflow = existing.length + fresh.length - MAX_FACTS_PER_USER;
      for (const stale of existing.slice(0, Math.max(0, overflow))) this.dbs.assistantMemoryDB.remove(`${userId}/${stale._id}`);
    });
    return fresh.length;
  }

  public async remove(userId: string, factId: string): Promise<boolean> {
    const key = `${userId}/${factId}`;
    if (!this.dbs.assistantMemoryDB.get(key)) return false;
    await this.dbs.assistantMemoryDB.remove(key);
    return true;
  }

  public async removeMatching(userId: string, texts: string[]): Promise<number> {
    const wanted = texts.map(normalize).filter(Boolean);
    const hits = this.list(userId).filter((fact) => wanted.some((text) => normalize(fact.text) === text || normalize(fact.text).includes(text)));
    if (!hits.length) return 0;
    await this.dbs.assistantMemoryDB.transaction(() => {
      for (const fact of hits) this.dbs.assistantMemoryDB.remove(`${userId}/${fact._id}`);
    });
    return hits.length;
  }

  public async removeAll(userId: string): Promise<void> {
    const prefix = `${userId}/`;
    const keys = Array.from(this.dbs.assistantMemoryDB.getKeys({ start: prefix, end: `${prefix}${KEY_END}` }));
    await this.dbs.assistantMemoryDB.transaction(() => {
      for (const key of keys) this.dbs.assistantMemoryDB.remove(key);
    });
  }
}

export function memoryAdapter(store: AssistantMemoryStore, extract: MemoryExtractor, logger: LoggerService): MemoryAdapter {
  return {
    id: 'camera.ui',
    async recall(scope) {
      if (!scope.userId) return { systemPrompt: '' };
      const facts = store.list(scope.userId);
      if (!facts.length) return { systemPrompt: '' };
      return {
        systemPrompt: [
          'What you remember about this user from earlier conversations (they can ask you to forget any of it):',
          ...facts.map((fact) => `- ${fact.text}`),
        ].join('\n'),
        fragments: facts.map((fact) => ({ text: fact.text, source: 'camera.ui' })),
      };
    },
    async save(scope, turn) {
      if (!scope.userId || turn.user.trim().length < MIN_TURN_CHARS || turn.user.trim() === '[continue]') return [];
      const existing = store.list(scope.userId).map((fact) => fact.text);
      const change = await extract(turn, existing);
      const removed = change.remove.length ? await store.removeMatching(scope.userId, change.remove) : 0;
      const added = change.add.length ? await store.add(scope.userId, change.add, scope.threadId) : 0;
      if (added || removed) logger.debug(`Assistant memory: ${added} facts added, ${removed} removed`);
      return [{ ok: true }];
    },
    async listFacts(scope) {
      if (!scope.userId) return [];
      return store.list(scope.userId).map((fact) => ({ id: fact._id, text: fact.text, source: fact.source, createdAt: new Date(fact.createdAt).toISOString() }));
    },
  };
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
