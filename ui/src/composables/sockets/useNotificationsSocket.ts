import { Badge } from '@capawesome/capacitor-badge';

import { listCastTargetsFn } from '@/api/routes/cast.js';
import { isCapacitor } from '@/connection/index.js';
import { setFaviconBadge } from '@/utils/faviconBadge.js';

import type { CastTarget } from '@/api/routes/cast.js';
import type { SocketChannel } from '@/connection/index.js';
import type { StoredNotification } from '@shared/types';

export interface NotificationsSocketState {
  notifications: StoredNotification[];
  castTargets: CastTarget[];
}

const HISTORY_LIMIT = 100;

const state = reactive<NotificationsSocketState>({
  notifications: [],
  castTargets: [],
});

let scope: ReturnType<typeof effectScope> | null = null;
let channel: SocketChannel | null = null;
let badgeReady = false;

function ensureChannel(): SocketChannel {
  if (channel) return channel;

  scope = effectScope(true);
  scope.run(() => {
    const ch = useSocket('/notifications');
    // Assign before onReady: onReady fires synchronously when the socket is
    // already connected, and fetchNotifications() reads the module-level `channel`.
    channel = ch;

    ch.on<StoredNotification>('notification', (n) => {
      if (n.tag) {
        const existingIndex = state.notifications.findIndex((h) => h.tag === n.tag);
        if (existingIndex !== -1) state.notifications.splice(existingIndex, 1);
      }
      state.notifications.unshift(n);
      if (state.notifications.length > HISTORY_LIMIT) {
        state.notifications.length = HISTORY_LIMIT;
      }
      forwardToDesktop(n);
    });

    ch.on<StoredNotification[]>('history', takeServerList);

    ch.on<CastTarget[]>('castTargets', (data) => {
      state.castTargets = data;
    });

    ch.onReady(() => {
      fetchNotifications();
      fetchCastTargets();
    });

    useTabVisibility().onTabVisible(() => fetchNotifications());

    watch(() => state.notifications.filter((n) => n.seenAt == null).length, applyBadge);
  });

  return channel!;
}

function takeServerList(list: StoredNotification[]): void {
  state.notifications = list;
  badgeReady = true;
  applyBadge();
}

// the iOS extension counts pushes up on its own, so every server list resets the badge even when the unread count did not change
function applyBadge(): void {
  if (!badgeReady) return;
  const count = state.notifications.filter((n) => n.seenAt == null).length;
  setNativeBadge(count);
  setFaviconBadge(count > 0);
}

function forwardToDesktop(n: StoredNotification): void {
  const { isElectronApp, electron } = useElectron();
  if (!isElectronApp || !electron) return;

  electron.send('show-notification', {
    id: n.id,
    title: n.title,
    subtitle: n.subtitle,
    body: n.body,
    deepLink: n.deepLink,
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
    takeServerList(await channel.request<StoredNotification[]>('get-notifications'));
  } catch {
    // server unreachable — silent; reconnect path will re-fetch
  }
}

export function useNotificationsSocket() {
  function connect(): void {
    ensureChannel();
  }

  function disconnect(): void {
    // Channel teardown is global via resetNotificationsSocket().
  }

  function removeNotification(notification: StoredNotification): void {
    const index = state.notifications.findIndex((n) => n.id === notification.id);
    if (index !== -1) state.notifications.splice(index, 1);
    if (notification.tag) channel?.emit('remove-notification', notification.tag);
    else channel?.emit('remove-notification-id', notification.id);
  }

  function clearNotifications(): void {
    state.notifications.splice(0, state.notifications.length);
    channel?.emit('clear-notifications');
  }

  function markAllSeen(): void {
    const now = Date.now();
    for (const n of state.notifications) {
      if (n.seenAt == null) n.seenAt = now;
    }
    channel?.emit('mark-all-seen');
  }

  function markSeen(notification: StoredNotification): void {
    const item = state.notifications.find((n) => n.id === notification.id);
    if (item && item.seenAt == null) item.seenAt = Date.now();
    channel?.emit('mark-seen', notification.id);
  }

  function addLocalNotification(notification: StoredNotification): void {
    if (!state.notifications.find((n) => n.id === notification.id)) {
      state.notifications.unshift(notification);
    }
  }

  return {
    isConnected: computed(() => channel?.connected.value ?? false),
    notifications: computed(() => state.notifications),
    notificationCount: computed(() => state.notifications.length),
    unreadCount: computed(() => state.notifications.filter((n) => n.seenAt == null).length),
    castTargets: computed(() => state.castTargets),

    connect,
    disconnect,
    fetchNotifications,
    removeNotification,
    clearNotifications,
    markAllSeen,
    markSeen,
    addLocalNotification,
  };
}

export function resetNotificationsSocket(): void {
  scope?.stop();
  scope = null;
  channel = null;
  badgeReady = false;
  state.notifications = [];
  state.castTargets = [];
  setNativeBadge(0);
  setFaviconBadge(false);
}
