import { matchesNotificationFilter, notificationSourceId } from '@shared/types';

import { deleteNotificationsFn, getNotificationFn, listNotificationsFn, markNotificationSeenFn, markNotificationsSeenFn } from '@/api/routes/notifications.js';
import { dropNotifications, insertNewest, markRead, replaceNotification } from '@/utils/notificationList.js';

import type { SeenDelta } from '@/utils/notificationList.js';
import type { NotificationFilter, NotificationPage, NotificationSourceCount, StoredNotification } from '@shared/types';
import type { Ref } from 'vue';

export interface NotificationCenterOptions {
  filter: Ref<NotificationFilter>;
  query: Ref<string>;
  source: Ref<string>;
  isAtTop: () => boolean;
}

const PAGE_SIZE = 50;

export function useNotificationCenter({ filter, query, source, isAtTop }: NotificationCenterOptions) {
  const channel = useSocket('/notifications');

  const items = ref<StoredNotification[]>([]);
  const incoming = ref<StoredNotification[]>([]);
  const selected = ref<StoredNotification>();
  const counts = ref<Partial<Record<NotificationFilter, number>>>({});
  const sources = ref<NotificationSourceCount[]>([]);
  const unread = ref(0);
  const loading = ref(false);
  const hasMore = ref(true);

  let cursor: string | undefined;
  let request: AbortController | undefined;
  let wasReady = false;

  function lists(): StoredNotification[][] {
    return selected.value ? [items.value, incoming.value, [selected.value]] : [items.value, incoming.value];
  }

  function listParams() {
    return { filter: filter.value, q: query.value || undefined, source: source.value || undefined };
  }

  async function loadMore(): Promise<void> {
    if (loading.value || !hasMore.value) return;

    const controller = new AbortController();
    request = controller;
    loading.value = true;
    try {
      const page = await listNotificationsFn({ ...listParams(), cursor, limit: PAGE_SIZE }, controller.signal);
      const known = new Set(items.value.map((n) => n.id));
      items.value.push(...page.items.filter((n) => !known.has(n.id)));
      cursor = page.cursor;
      hasMore.value = !!page.cursor;
      unread.value = page.unread;
      if (page.counts) applyCounts(page);
    } catch {
      // without this the infinite scroll retries a failing request in a loop, a reconnect loads again
      if (!controller.signal.aborted) hasMore.value = false;
    } finally {
      if (request === controller) loading.value = false;
    }
  }

  function reload(): void {
    request?.abort();
    request = undefined;
    cursor = undefined;
    items.value = [];
    incoming.value = [];
    hasMore.value = true;
    loading.value = false;
    loadMore();
  }

  async function refreshCounts(): Promise<void> {
    try {
      const page = await listNotificationsFn({ ...listParams(), limit: 1 });
      if (page.counts) applyCounts(page);
      unread.value = page.unread;
    } catch {
      // the menu keeps the last counts
    }
  }

  function applyCounts(page: NotificationPage): void {
    counts.value = page.counts ?? {};
    sources.value = page.sources ?? [];
  }

  function select(item: StoredNotification): void {
    selected.value = item;
    setSeen(item, true);
  }

  async function open(id: string): Promise<void> {
    const known = items.value.find((n) => n.id === id) ?? incoming.value.find((n) => n.id === id);
    try {
      select(known ?? (await getNotificationFn(id)));
    } catch {
      // deleted in the meantime
    }
  }

  function close(): void {
    selected.value = undefined;
  }

  function mergeIncoming(): void {
    items.value = [...incoming.value, ...items.value];
    incoming.value = [];
  }

  function setSeen(item: StoredNotification, seen: boolean): void {
    if ((item.seenAt == null) !== seen) return;

    item.seenAt = seen ? Date.now() : null;
    unread.value = Math.max(0, unread.value + (seen ? -1 : 1));
    markNotificationSeenFn(item.id, seen).catch(() => reload());
  }

  function markSeen(ids?: string[]): void {
    const at = Date.now();
    const unseen = new Set(lists().flatMap((list) => list.filter((n) => n.seenAt == null && (!ids || ids.includes(n.id))).map((n) => n.id)));
    for (const list of lists()) markRead(list, { at, ids });
    unread.value = ids ? Math.max(0, unread.value - unseen.size) : 0;
    markNotificationsSeenFn(ids).catch(() => reload());
  }

  function remove(ids: string[]): void {
    const unseen = new Set(lists().flatMap((list) => list.filter((n) => n.seenAt == null && ids.includes(n.id)).map((n) => n.id)));
    dropRemoved(ids);
    unread.value = Math.max(0, unread.value - unseen.size);
    deleteNotificationsFn(ids).catch(() => reload());
  }

  function dropRemoved(ids: string[]): void {
    dropNotifications(items.value, ids);
    dropNotifications(incoming.value, ids);
    if (selected.value && ids.includes(selected.value.id)) selected.value = undefined;
  }

  channel.on<StoredNotification>('added', (n) => {
    if (query.value || !matchesNotificationFilter(n, n.seenAt == null, filter.value) || (source.value && notificationSourceId(n) !== source.value)) return;
    insertNewest(isAtTop() ? items.value : incoming.value, n);
  });

  channel.on<StoredNotification>('updated', (n) => {
    for (const list of lists()) replaceNotification(list, n);
    if (selected.value?.id === n.id) selected.value = n;
  });

  channel.on<{ ids: string[] }>('removed', ({ ids }) => dropRemoved(ids));

  channel.on<SeenDelta>('seen', (delta) => {
    for (const list of lists()) markRead(list, delta);
  });

  channel.on<number>('unread', (count) => {
    unread.value = count;
  });

  channel.onReady(() => {
    if (wasReady) reload();
    wasReady = true;
  });

  return {
    items,
    incoming,
    counts,
    sources,
    unread,
    loading,
    hasMore,
    selected,
    loadMore,
    reload,
    refreshCounts,
    select,
    open,
    close,
    mergeIncoming,
    setSeen,
    markSeen,
    remove,
  };
}
