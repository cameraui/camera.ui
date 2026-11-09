import { Badge } from '@capawesome/capacitor-badge';

import { listCastTargetsFn } from '@/api/routes/cast.js';
import { deleteAllNotificationsFn, deleteNotificationFn, listNotificationsFn, markNotificationSeenFn, markNotificationsSeenFn } from '@/api/routes/notifications.js';
import { isCapacitor } from '@/connection/index.js';
import { setFaviconBadge } from '@/utils/faviconBadge.js';
import { dropNotifications, insertNewest, markRead, replaceNotification } from '@/utils/notificationList.js';

import type { CastTarget } from '@/api/routes/cast.js';
import type { SocketChannel } from '@/connection/index.js';
import type { SeenDelta } from '@/utils/notificationList.js';
import type { StoredNotification } from '@shared/types';

export interface NotificationsSocketState {
  notifications: StoredNotification[];
  local: StoredNotification[];
  unread: number;
  castTargets: CastTarget[];
}

const BELL_LIMIT = 30;

const state = reactive<NotificationsSocketState>({
  notifications: [],
  local: [],
  unread: 0,
  castTargets: [],
});

const unreadCount = computed(() => state.unread + state.local.filter((n) => n.seenAt == null).length);

let scope: ReturnType<typeof effectScope> | null = null;
let channel: SocketChannel | null = null;
let badgeReady = false;

function ensureChannel(): SocketChannel {
  if (channel) return channel;

  scope = effectScope(true);
  scope.run(() => {
    const ch = useSocket('/notifications');
    // assign before onReady: it fires synchronously on a connected socket, and fetchNotifications() reads `channel`
    channel = ch;

    ch.on<StoredNotification>('added', (n) => {
      insertNewest(state.notifications, n, BELL_LIMIT);
      if (!n.listOnly) forwardToDesktop(n);
    });
    ch.on<StoredNotification>('updated', (n) => replaceNotification(state.notifications, n));
    ch.on<{ ids: string[] }>('removed', ({ ids }) => {
      dropNotifications(state.notifications, ids);
      if (state.notifications.length < BELL_LIMIT) fetchNotifications();
    });
    ch.on<SeenDelta>('seen', (delta) => markRead(state.notifications, delta));
    ch.on<number>('unread', (count) => {
      state.unread = count;
    });

    ch.on<CastTarget[]>('castTargets', (data) => {
      state.castTargets = data;
    });

    ch.onReady(() => {
      fetchNotifications();
      fetchCastTargets();
    });

    useTabVisibility().onTabVisible(() => fetchNotifications());

    watch(unreadCount, applyBadge);
  });

  return channel!;
}

function applyBadge(): void {
  if (!badgeReady) return;
  // the iOS extension counts pushes up itself, so the badge is set even when the count did not change
  setNativeBadge(unreadCount.value);
  setFaviconBadge(unreadCount.value > 0);
}

function forwardToDesktop(n: StoredNotification): void {
  const { isElectronApp, electron } = useElectron();
  if (!isElectronApp || !electron) return;

  electron.send('show-notification', {
    id: n.id,
    title: n.title,
    subtitle: n.subtitle,
    body: n.body,
    deepLink: n.deepLink ?? `/notifications?id=${encodeURIComponent(n.id)}`,
    tag: n.tag,
    severity: n.severity,
    silent: n.silent,
  });
}

async function setNativeBadge(count: number): Promise<void> {
  if (isCapacitor) {
    try {
      await Badge.set({ count });
    } catch {
      // ignore
    }
    return;
  }

  const { isElectronApp, electron } = useElectron();
  if (isElectronApp && electron) {
    electron.send('set-badge-count', count);
  }
}

async function fetchCastTargets(): Promise<void> {
  const role = useAuthStore().user?.role;
  if (role !== 'admin' && role !== 'master') return;
  try {
    state.castTargets = await listCastTargetsFn();
  } catch {
    // older server without the cast route
  }
}

async function fetchNotifications(): Promise<void> {
  if (!channel?.ready.value) return;
  try {
    const page = await listNotificationsFn({ limit: BELL_LIMIT });
    state.notifications = page.items;
    state.unread = page.unread;
    badgeReady = true;
    applyBadge();
  } catch {
    // unreachable, the reconnect fetches again
  }
}

function findNotification(id: string): StoredNotification | undefined {
  return state.local.find((n) => n.id === id) ?? state.notifications.find((n) => n.id === id);
}

function isLocal(notification: StoredNotification): boolean {
  return state.local.some((n) => n.id === notification.id);
}

export function useNotificationsSocket() {
  function connect(): void {
    ensureChannel();
  }

  function disconnect(): void {
    // teardown runs in resetNotificationsSocket()
  }

  async function setSeen(notification: StoredNotification, seen: boolean): Promise<void> {
    if ((notification.seenAt == null) !== seen) return;

    const item = findNotification(notification.id);
    if (item) item.seenAt = seen ? Date.now() : null;
    if (isLocal(notification)) return;

    state.unread = Math.max(0, state.unread + (seen ? -1 : 1));
    await markNotificationSeenFn(notification.id, seen).catch(() => fetchNotifications());
  }

  async function markAllSeen(): Promise<void> {
    markRead(state.local, { at: Date.now() });
    markRead(state.notifications, { at: Date.now() });
    state.unread = 0;
    await markNotificationsSeenFn().catch(() => fetchNotifications());
  }

  async function removeNotification(notification: StoredNotification): Promise<void> {
    const local = isLocal(notification);
    dropNotifications(state.local, [notification.id]);
    dropNotifications(state.notifications, [notification.id]);
    if (local) return;

    if (notification.seenAt == null) state.unread = Math.max(0, state.unread - 1);
    await deleteNotificationFn(notification.id).catch(() => fetchNotifications());
  }

  async function clearNotifications(): Promise<void> {
    state.local = [];
    state.notifications = [];
    state.unread = 0;
    await deleteAllNotificationsFn().catch(() => fetchNotifications());
  }

  function addLocalNotification(notification: StoredNotification): void {
    if (!state.local.some((n) => n.id === notification.id)) {
      state.local.unshift(notification);
    }
  }

  return {
    isConnected: computed(() => channel?.connected.value ?? false),
    notifications: computed(() => [...state.local, ...state.notifications]),
    unreadCount,
    castTargets: computed(() => state.castTargets),

    connect,
    disconnect,
    fetchNotifications,
    markSeen: (notification: StoredNotification) => setSeen(notification, true),
    markUnseen: (notification: StoredNotification) => setSeen(notification, false),
    markAllSeen,
    removeNotification,
    clearNotifications,
    addLocalNotification,
    isLocal,
  };
}

export function resetNotificationsSocket(): void {
  scope?.stop();
  scope = null;
  channel = null;
  badgeReady = false;
  state.notifications = [];
  state.local = [];
  state.unread = 0;
  state.castTargets = [];
  setNativeBadge(0);
  setFaviconBadge(false);
}
