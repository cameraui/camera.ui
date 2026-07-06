import { isCapacitor } from '@/connection/index.js';

const PENDING_INTENT_KEY = 'cui.pending.notificationIntent';

export const AUTH_EVENT_TYPES = new Set(['new_login', 'family_compromised', 'logout_all', 'device_revoked']);

export type PendingNotificationIntent =
  { kind: 'open-server'; serverId?: string; serverName?: string; deepLink?: string } | { kind: 'auth-event'; data: Record<string, string> };

export function intentFromTapData(data: Record<string, string>): PendingNotificationIntent | null {
  if (AUTH_EVENT_TYPES.has(data.type)) {
    return { kind: 'auth-event', data };
  }
  const deepLink = typeof data.deepLink === 'string' ? data.deepLink : undefined;
  const serverId = typeof data.originServerId === 'string' ? data.originServerId : undefined;
  const serverName = typeof data.originName === 'string' ? data.originName : undefined;
  if (serverId || deepLink) {
    return { kind: 'open-server', serverId, serverName, deepLink };
  }
  return null;
}

export async function writePendingIntent(intent: PendingNotificationIntent): Promise<void> {
  if (!isCapacitor) return;
  const { Preferences } = await import('@capacitor/preferences');
  await Preferences.set({ key: PENDING_INTENT_KEY, value: JSON.stringify(intent) });
}

export async function readPendingIntent(): Promise<PendingNotificationIntent | null> {
  if (!isCapacitor) return null;
  const { Preferences } = await import('@capacitor/preferences');
  const { value } = await Preferences.get({ key: PENDING_INTENT_KEY });
  if (!value) return null;
  try {
    return JSON.parse(value) as PendingNotificationIntent;
  } catch {
    return null;
  }
}

export async function clearPendingIntent(): Promise<void> {
  if (!isCapacitor) return;
  const { Preferences } = await import('@capacitor/preferences');
  await Preferences.remove({ key: PENDING_INTENT_KEY });
}
