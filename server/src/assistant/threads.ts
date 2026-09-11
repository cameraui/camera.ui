import { randomUUID } from 'node:crypto';
import { container } from 'tsyringe';

import { dropThreadState } from './persistence.js';
import { isDataUpload, markerFor, partsOf } from './uploads.js';

import type { ModelMessage, UIMessage } from '@tanstack/ai';
import type { Database } from '../api/database/index.js';
import type { DBAssistantAttachment, DBAssistantAttachmentRecord, DBAssistantThread, DBAssistantThreadMeta } from '../api/database/types.js';
import type { AssistantThreadSummary } from './types.js';

const DEFAULT_THREADS_PER_USER = 50;
const MAX_STORED_MESSAGES = 200;
const DEFAULT_STORED_IMAGES = 24;
const TITLE_MAX = 60;
const THREAD_ID = /^[\w.-]{1,128}$/;
const KEY_END = '￿';

let attachmentSeq = 0;

export class AssistantThreadStore {
  private dbs: Database;

  constructor() {
    this.dbs = container.resolve<Database>('dbs');
  }

  public list(userId: string): AssistantThreadSummary[] {
    return this.metas(userId)
      .map((meta) => ({ id: meta._id, title: meta.title, createdAt: meta.createdAt, updatedAt: meta.updatedAt, messageCount: meta.messageCount }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public get(userId: string, threadId: string): DBAssistantThread | undefined {
    const key = threadKey(userId, threadId);
    const meta = this.dbs.assistantThreadsDB.get(key);
    if (!meta) return undefined;

    const attachments: Record<string, DBAssistantAttachment> = {};
    for (const { value } of this.dbs.assistantThreadAttachmentsDB.getRange(attachmentRange(key))) {
      attachments[value.toolCallId] = {
        images: value.images.map((image) => ({ data: toBase64(image.data), mimeType: image.mimeType, caption: image.caption })),
        references: value.references,
        ...(value.cards?.length ? { cards: value.cards } : {}),
        ...(value.settings?.length ? { settings: value.settings } : {}),
        ...(value.notices?.length ? { notices: value.notices } : {}),
      };
    }
    return { ...meta, messages: this.dbs.assistantThreadMessagesDB.get(key) ?? [], attachments };
  }

  public async ensure(userId: string, threadId: string, messages: (UIMessage | ModelMessage)[]): Promise<DBAssistantThreadMeta> {
    if (!THREAD_ID.test(threadId)) throw new Error('Invalid thread id');
    const key = threadKey(userId, threadId);
    const existing = this.dbs.assistantThreadsDB.get(key);
    if (existing) return existing;

    const now = Date.now();
    const stored = compactMessages(messages.slice(-MAX_STORED_MESSAGES));
    const meta: DBAssistantThreadMeta = {
      _id: threadId,
      userId,
      title: titleFromMessages(messages),
      createdAt: now,
      updatedAt: now,
      messageCount: stored.length,
      imageCount: 0,
    };
    await this.dbs.assistantThreadsDB.transaction(() => {
      if (this.dbs.assistantThreadsDB.get(key)) return;
      this.dbs.assistantThreadsDB.put(key, meta);
      this.dbs.assistantThreadMessagesDB.put(key, stored);
      this.pruneThreads(userId);
    });
    return this.dbs.assistantThreadsDB.get(key) ?? meta;
  }

  public async create(userId: string, title: string, messages: unknown[], attachments: Record<string, DBAssistantAttachment>): Promise<string> {
    const threadId = randomUUID();
    const key = threadKey(userId, threadId);
    const now = Date.now();
    await this.dbs.assistantThreadsDB.transaction(() => {
      const imageCount = this.pruneImages(key, this.putAttachments(key, attachments));
      this.dbs.assistantThreadsDB.put(key, {
        _id: threadId,
        userId,
        title: title.slice(0, TITLE_MAX),
        createdAt: now,
        updatedAt: now,
        messageCount: messages.length,
        imageCount,
      });
      this.dbs.assistantThreadMessagesDB.put(key, compactMessages(messages));
      this.pruneThreads(userId);
    });
    return threadId;
  }

  public async saveMessages(userId: string, threadId: string, messages: unknown[], titleSource: (UIMessage | ModelMessage)[]): Promise<void> {
    const key = threadKey(userId, threadId);
    const stored = compactMessages(messages.slice(-MAX_STORED_MESSAGES));
    await this.dbs.assistantThreadsDB.transaction(() => {
      const meta = this.dbs.assistantThreadsDB.get(key);
      if (!meta) return;
      this.dbs.assistantThreadsDB.put(key, { ...meta, title: meta.title || titleFromMessages(titleSource), updatedAt: Date.now(), messageCount: stored.length });
      this.dbs.assistantThreadMessagesDB.put(key, stored);
    });
  }

  public async replaceMessages(userId: string, threadId: string, messages: unknown[]): Promise<DBAssistantThread | undefined> {
    if (!this.dbs.assistantThreadsDB.get(threadKey(userId, threadId))) return undefined;
    await this.saveMessages(userId, threadId, messages, messages as UIMessage[]);
    return this.get(userId, threadId);
  }

  public async branch(userId: string, threadId: string, until: number): Promise<DBAssistantThread | undefined> {
    const source = this.get(userId, threadId);
    if (!source) return undefined;
    const id = await this.create(userId, source.title, source.messages.slice(0, until + 1), source.attachments);
    return this.get(userId, id);
  }

  public async append(userId: string, threadId: string, title: string, messages: unknown[], attachments: Record<string, DBAssistantAttachment>): Promise<number> {
    if (!THREAD_ID.test(threadId)) throw new Error('Invalid thread id');
    const key = threadKey(userId, threadId);
    const now = Date.now();
    let count = 0;
    await this.dbs.assistantThreadsDB.transaction(() => {
      const meta = this.dbs.assistantThreadsDB.get(key);
      const stored = compactMessages([...(this.dbs.assistantThreadMessagesDB.get(key) ?? []), ...messages].slice(-MAX_STORED_MESSAGES));
      const added = this.putAttachments(key, attachments);
      const imageCount = this.pruneImages(key, (meta?.imageCount ?? 0) + added);
      count = stored.length;
      this.dbs.assistantThreadsDB.put(key, {
        _id: threadId,
        userId,
        title: meta?.title.trim() ? meta.title : title.slice(0, TITLE_MAX),
        createdAt: meta?.createdAt ?? now,
        updatedAt: now,
        messageCount: count,
        imageCount,
      });
      this.dbs.assistantThreadMessagesDB.put(key, stored);
      if (!meta) this.pruneThreads(userId);
    });
    return count;
  }

  public async addAttachments(userId: string, threadId: string, attachments: Record<string, DBAssistantAttachment>): Promise<void> {
    const key = threadKey(userId, threadId);
    await this.dbs.assistantThreadsDB.transaction(() => {
      const meta = this.dbs.assistantThreadsDB.get(key);
      if (!meta) return;
      const added = this.putAttachments(key, attachments);
      const imageCount = this.pruneImages(key, meta.imageCount + added);
      if (imageCount !== meta.imageCount) this.dbs.assistantThreadsDB.put(key, { ...meta, imageCount });
    });
  }

  public async rename(userId: string, threadId: string, title: string): Promise<DBAssistantThread | undefined> {
    const key = threadKey(userId, threadId);
    const next = title.trim().slice(0, TITLE_MAX);
    const meta = await this.dbs.commit(this.dbs.assistantThreadsDB, key, (current) => (current ? { ...current, title: next || current.title } : undefined));
    return meta ? this.get(userId, threadId) : undefined;
  }

  public async remove(userId: string, threadId: string): Promise<boolean> {
    const key = threadKey(userId, threadId);
    if (!this.dbs.assistantThreadsDB.get(key)) return false;
    await this.dbs.assistantThreadsDB.transaction(() => this.drop(key));
    return true;
  }

  public async removeAll(userId: string): Promise<void> {
    await this.dbs.assistantThreadsDB.transaction(() => {
      for (const meta of this.metas(userId)) this.drop(threadKey(userId, meta._id));
    });
  }

  private metas(userId: string): DBAssistantThreadMeta[] {
    const prefix = `${userId}/`;
    return Array.from(this.dbs.assistantThreadsDB.getRange({ start: prefix, end: `${prefix}${KEY_END}` })).map((entry) => entry.value);
  }

  private putAttachments(key: string, attachments: Record<string, DBAssistantAttachment>): number {
    let added = 0;
    for (const [toolCallId, entry] of Object.entries(attachments)) {
      if (!entry.images.length && !entry.references.length && !entry.cards?.length && !entry.settings?.length && !entry.notices?.length) continue;
      const record: DBAssistantAttachmentRecord = {
        toolCallId,
        images: entry.images.map((image) => ({ data: Buffer.from(image.data, 'base64'), mimeType: image.mimeType, caption: image.caption })),
        references: entry.references,
        ...(entry.cards?.length ? { cards: entry.cards } : {}),
        ...(entry.settings?.length ? { settings: entry.settings } : {}),
        ...(entry.notices?.length ? { notices: entry.notices } : {}),
      };
      this.dbs.assistantThreadAttachmentsDB.put(attachmentKey(key), record);
      added += entry.images.length;
    }
    return added;
  }

  private limits(): { threads: number; images: number } {
    const settings = this.dbs.assistantDB.get('assistant');
    return { threads: settings?.historyThreads ?? DEFAULT_THREADS_PER_USER, images: settings?.historyImages ?? DEFAULT_STORED_IMAGES };
  }

  private pruneImages(key: string, imageCount: number): number {
    const max = this.limits().images;
    if (imageCount <= max) return imageCount;

    let count = imageCount;
    const stripped: { recordKey: string; value: DBAssistantAttachmentRecord }[] = [];
    for (const { key: recordKey, value } of this.dbs.assistantThreadAttachmentsDB.getRange(attachmentRange(key))) {
      if (count <= max) break;
      if (!value.images.length) continue;
      count -= value.images.length;
      stripped.push({ recordKey, value });
    }
    for (const { recordKey, value } of stripped) {
      const keep = value.references.length + (value.cards?.length ?? 0) + (value.settings?.length ?? 0) + (value.notices?.length ?? 0) > 0;
      if (keep) this.dbs.assistantThreadAttachmentsDB.put(recordKey, { ...value, images: [] });
      else this.dbs.assistantThreadAttachmentsDB.remove(recordKey);
    }
    return count;
  }

  private pruneThreads(userId: string): void {
    const metas = this.metas(userId).sort((a, b) => b.updatedAt - a.updatedAt);
    for (const stale of metas.slice(this.limits().threads)) this.drop(threadKey(userId, stale._id));
  }

  private drop(key: string): void {
    const [userId, threadId] = key.split('/');
    dropThreadState(this.dbs, userId, threadId);
    this.dbs.assistantThreadsDB.remove(key);
    this.dbs.assistantThreadMessagesDB.remove(key);
    for (const recordKey of Array.from(this.dbs.assistantThreadAttachmentsDB.getKeys(attachmentRange(key)))) {
      this.dbs.assistantThreadAttachmentsDB.remove(recordKey);
    }
  }
}

export function contentParts(content: unknown): unknown[] | undefined {
  if (Array.isArray(content)) return content;
  if (typeof content !== 'string' || !content.trimStart().startsWith('[')) return undefined;
  try {
    const parsed: unknown = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function threadKey(userId: string, threadId: string): string {
  return `${userId}/${threadId}`;
}

function attachmentKey(key: string): string {
  attachmentSeq = (attachmentSeq + 1) & 0xffff;
  return `${key}/${Date.now().toString(16).padStart(11, '0')}${attachmentSeq.toString(16).padStart(4, '0')}`;
}

function attachmentRange(key: string): { start: string; end: string } {
  return { start: `${key}/`, end: `${key}/${KEY_END}` };
}

function toBase64(data: Uint8Array): string {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('base64');
}

function compactMessages(messages: unknown[]): unknown[] {
  return messages.map((message) => {
    const parts = partsOf(message);
    if (!parts.length) return message;
    const field = Array.isArray((message as { parts?: unknown }).parts) ? 'parts' : 'content';

    let changed = false;
    const next = parts.map((part) => {
      const typed = part as { type: string; content?: unknown; source?: { type?: string; value?: string; mimeType?: string } };
      if (isDataUpload(typed)) {
        changed = true;
        return markerFor(typed);
      }
      if (typed?.type !== 'tool-result') return part;
      const content = withoutImages(typed.content);
      if (content === typed.content) return part;
      changed = true;
      return { ...typed, content };
    });
    return changed ? { ...(message as object), [field]: next } : message;
  });
}

function withoutImages(content: unknown): unknown {
  const parts = contentParts(content);
  if (!parts?.some((part) => (part as { type?: string })?.type === 'image')) return content;
  const kept = parts.filter((part) => (part as { type?: string })?.type !== 'image');
  return typeof content === 'string' ? JSON.stringify(kept) : kept;
}

function titleFromMessages(messages: (UIMessage | ModelMessage)[]): string {
  for (const message of messages) {
    if (message.role !== 'user') continue;
    const text =
      'parts' in message
        ? message.parts.map((p) => (p.type === 'text' ? p.content : '')).join(' ')
        : typeof message.content === 'string'
          ? message.content
          : (message.content ?? []).map((p) => (p.type === 'text' ? p.content : '')).join(' ');
    const trimmed = text.replace(/\s+/g, ' ').trim();
    if (trimmed) return trimmed.length > TITLE_MAX ? `${trimmed.slice(0, TITLE_MAX - 1)}…` : trimmed;
  }
  return 'New conversation';
}
