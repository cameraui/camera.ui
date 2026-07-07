import { Badge } from '@capawesome/capacitor-badge';

import { isCapacitor } from '@/connection/index.js';
import { setFaviconBadge } from '@/utils/faviconBadge.js';

import type { SocketChannel } from '@/connection/index.js';
import type { StoredNotification } from '@shared/types';

export interface NotificationsSocketState {
  notifications: StoredNotification[];
}

const HISTORY_LIMIT = 100;

const state = reactive<NotificationsSocketState>({
  notifications: [],
});

let scope: ReturnType<typeof effectScope> | null = null;
let channel: SocketChannel | null = null;

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

    ch.on<StoredNotification[]>('history', (data) => {
      state.notifications = data;
    });

    ch.onReady(() => {
      fetchNotifications();
    });

    watch(
      () => state.notifications.filter((n) => n.seenAt == null).length,
      (count) => {
        setNativeBadge(count);
        setFaviconBadge(count > 0);
      },
      { immediate: true },
    );
  });

  return channel!;
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

async function fetchNotifications(): Promise<void> {
  if (!channel?.ready.value) return;
  try {
    const data = await channel.request<StoredNotification[]>('get-notifications');
    state.notifications = data;
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
  state.notifications = [];
}
