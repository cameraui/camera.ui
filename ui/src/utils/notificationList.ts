import type { StoredNotification } from '@shared/types';

export interface SeenDelta {
  at: number;
  ids?: string[];
}

export function insertNewest(list: StoredNotification[], notification: StoredNotification, limit = Infinity): void {
  if (list.some((n) => n.id === notification.id)) return;
  const index = list.findIndex((n) => n.createdAt < notification.createdAt);
  list.splice(index === -1 ? list.length : index, 0, notification);
  if (list.length > limit) list.length = limit;
}

export function replaceNotification(list: StoredNotification[], notification: StoredNotification): void {
  const index = list.findIndex((n) => n.id === notification.id);
  if (index !== -1) list[index] = notification;
}

export function dropNotifications(list: StoredNotification[], ids: string[]): void {
  const dropped = new Set(ids);
  for (let i = list.length - 1; i >= 0; i--) {
    if (dropped.has(list[i].id)) list.splice(i, 1);
  }
}

export function markRead(list: StoredNotification[], { at, ids }: SeenDelta): void {
  const only = ids && new Set(ids);
  for (const n of list) {
    if (!only || only.has(n.id)) n.seenAt ??= at;
  }
}
