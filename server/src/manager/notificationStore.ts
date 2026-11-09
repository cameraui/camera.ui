import { NOTIFICATION_FILTERS } from '../api/schemas/notifications.schema.js';
import { inject } from '../container.js';
import { matchesNotificationFilter, notificationSourceId } from './types.js';

import type { Database } from '../api/database/index.js';
import type { DBNotificationEntry, StoredNotification } from '../api/database/types.js';
import type { NotificationFilter } from '../api/schemas/notifications.schema.js';
import type { NotificationPage } from '../api/types/index.js';

export interface NotificationQuery {
  cursor?: string;
  limit: number;
  filter: NotificationFilter;
  source?: string;
  matches?: (entry: DBNotificationEntry) => boolean;
}

export interface NotificationSourceTally {
  count: number;
  latest: DBNotificationEntry;
}

export interface NotificationChange {
  removed: Map<string, string[]>;
  dropped: string[];
}

const BUCKET_LIMIT = 100;
const LEGACY_LIMIT = 100;

export class NotificationStore {
  private dbs: Database;
  private byId = new Map<string, DBNotificationEntry>();
  private sorted: DBNotificationEntry[] = [];

  constructor() {
    this.dbs = inject('dbs');
  }

  public load(): void {
    for (const { value } of this.dbs.notificationEntriesDB.getRange()) {
      this.byId.set(value.id, value);
    }
    this.sorted = [...this.byId.values()].sort(compareNewestFirst);
  }

  public ids(): Set<string> {
    return new Set(this.byId.keys());
  }

  public visible(userId: string, id: string): DBNotificationEntry | undefined {
    const entry = this.byId.get(id);
    return entry?.recipients.includes(userId) ? entry : undefined;
  }

  public view(entry: DBNotificationEntry, userId: string): StoredNotification {
    const { recipients, seenBy, ...rest } = entry;
    return { ...rest, seenAt: seenBy[userId] ?? null };
  }

  public async insert(entry: DBNotificationEntry): Promise<NotificationChange> {
    const change: NotificationChange = { removed: new Map(), dropped: [] };
    const touched = new Set<DBNotificationEntry>([entry]);

    if (entry.tag) {
      for (const older of this.sorted.filter((item) => item.tag === entry.tag)) {
        const users = older.recipients.filter((userId) => entry.recipients.includes(userId));
        if (users.length) this.withdraw(older, users, change, touched);
      }
    }

    this.sorted.splice(this.insertIndex(entry), 0, entry);
    this.byId.set(entry.id, entry);

    const bucket = this.sorted.filter((item) => item.bucket === entry.bucket);
    for (const old of bucket.slice(BUCKET_LIMIT)) {
      this.withdraw(old, [...old.recipients], change, touched);
    }

    await this.persist(touched, change.dropped);
    return change;
  }

  public async update(id: string, apply: (entry: DBNotificationEntry) => void): Promise<DBNotificationEntry | undefined> {
    const entry = this.byId.get(id);
    if (!entry) return undefined;

    apply(entry);
    await this.persist([entry], []);
    return entry;
  }

  public async setSeen(userId: string, seen: boolean, ids?: string[]): Promise<DBNotificationEntry[]> {
    const now = Date.now();
    const changed = this.targets(userId, ids).filter((entry) => userId in entry.seenBy !== seen);

    for (const entry of changed) {
      if (seen) entry.seenBy[userId] = now;
      else delete entry.seenBy[userId];
    }

    if (changed.length) await this.persist(changed, []);
    return changed;
  }

  public async hide(userId: string, ids?: string[]): Promise<NotificationChange> {
    const change: NotificationChange = { removed: new Map(), dropped: [] };
    const touched = new Set<DBNotificationEntry>();

    for (const entry of this.targets(userId, ids)) {
      this.withdraw(entry, [userId], change, touched);
    }

    await this.persist(touched, change.dropped);
    return change;
  }

  public async removeTag(tag: string): Promise<NotificationChange> {
    const change: NotificationChange = { removed: new Map(), dropped: [] };
    const touched = new Set<DBNotificationEntry>();

    for (const entry of this.sorted.filter((item) => item.tag === tag)) {
      this.withdraw(entry, [...entry.recipients], change, touched);
    }

    await this.persist(touched, change.dropped);
    return change;
  }

  public page(userId: string, query: NotificationQuery): NotificationPage {
    const items: StoredNotification[] = [];
    let more = false;

    for (let i = query.cursor ? this.indexAfter(query.cursor) : 0; i < this.sorted.length; i++) {
      const entry = this.sorted[i];
      if (!this.listed(entry, userId, query.filter, query.matches) || (query.source && notificationSourceId(entry) !== query.source)) continue;
      if (items.length === query.limit) {
        more = true;
        break;
      }
      items.push(this.view(entry, userId));
    }

    const last = items.at(-1);
    return {
      items,
      cursor: more && last ? `${last.createdAt}:${last.id}` : undefined,
      counts: query.cursor ? undefined : this.counts(userId, query.matches),
      unread: this.unreadCount(userId),
    };
  }

  public legacy(userId: string): StoredNotification[] {
    const items: StoredNotification[] = [];
    for (const entry of this.sorted) {
      if (items.length === LEGACY_LIMIT) break;
      if (!entry.listOnly && entry.recipients.includes(userId)) items.push(this.view(entry, userId));
    }
    return items;
  }

  public unreadCount(userId: string): number {
    let count = 0;
    for (const entry of this.sorted) {
      if (entry.recipients.includes(userId) && !(userId in entry.seenBy)) count++;
    }
    return count;
  }

  public bySource(userId: string, filter: NotificationFilter, matches?: (entry: DBNotificationEntry) => boolean): Map<string, NotificationSourceTally> {
    const sources = new Map<string, NotificationSourceTally>();
    for (const entry of this.sorted) {
      const id = this.listed(entry, userId, filter, matches) ? notificationSourceId(entry) : undefined;
      if (!id) continue;
      const source = sources.get(id);
      if (source) source.count++;
      else sources.set(id, { count: 1, latest: entry });
    }
    return sources;
  }

  private counts(userId: string, matches?: (entry: DBNotificationEntry) => boolean): Record<NotificationFilter, number> {
    const counts = Object.fromEntries(NOTIFICATION_FILTERS.map((filter) => [filter, 0])) as Record<NotificationFilter, number>;
    for (const entry of this.sorted) {
      if (!entry.recipients.includes(userId) || (matches && !matches(entry))) continue;
      for (const filter of NOTIFICATION_FILTERS) {
        if (matchesNotificationFilter(entry, !(userId in entry.seenBy), filter)) counts[filter]++;
      }
    }
    return counts;
  }

  private listed(entry: DBNotificationEntry, userId: string, filter: NotificationFilter, matches?: (entry: DBNotificationEntry) => boolean): boolean {
    return entry.recipients.includes(userId) && matchesNotificationFilter(entry, !(userId in entry.seenBy), filter) && (!matches || matches(entry));
  }

  private targets(userId: string, ids?: string[]): DBNotificationEntry[] {
    const entries = ids ? ids.map((id) => this.byId.get(id)).filter((entry) => entry !== undefined) : this.sorted;
    return entries.filter((entry) => entry.recipients.includes(userId));
  }

  private withdraw(entry: DBNotificationEntry, users: string[], change: NotificationChange, touched: Set<DBNotificationEntry>): void {
    for (const userId of users) {
      change.removed.set(userId, [...(change.removed.get(userId) ?? []), entry.id]);
      delete entry.seenBy[userId];
    }
    entry.recipients = entry.recipients.filter((userId) => !users.includes(userId));

    if (entry.recipients.length) {
      touched.add(entry);
      return;
    }

    touched.delete(entry);
    change.dropped.push(entry.id);
    this.byId.delete(entry.id);
    this.sorted.splice(this.sorted.indexOf(entry), 1);
  }

  private async persist(entries: Iterable<DBNotificationEntry>, dropped: string[]): Promise<void> {
    const db = this.dbs.notificationEntriesDB;
    await db.transaction(() => {
      for (const entry of entries) db.put(entry.id, entry);
      for (const id of dropped) db.remove(id);
    });
  }

  private insertIndex(entry: DBNotificationEntry): number {
    let low = 0;
    let high = this.sorted.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (compareNewestFirst(this.sorted[mid], entry) < 0) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  private indexAfter(cursor: string): number {
    const separator = cursor.indexOf(':');
    const position = { createdAt: Number(cursor.slice(0, separator)), id: cursor.slice(separator + 1) };
    let low = 0;
    let high = this.sorted.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (compareNewestFirst(this.sorted[mid], position) <= 0) low = mid + 1;
      else high = mid;
    }
    return low;
  }
}

function compareNewestFirst(a: { createdAt: number; id: string }, b: { createdAt: number; id: string }): number {
  return b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}
