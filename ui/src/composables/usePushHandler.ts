import { Capacitor } from '@capacitor/core';

import { CLOUD_SERVICE_URL } from '@/common/constants.js';
import { intentFromTapData, writePendingIntent } from '@/common/pushIntent';
import { bounceToCloudFrontend, getCurrentServerId, isCapacitor } from '@/connection/index.js';

const log = useLogger('PushHandler');

const MUTE_MINUTES: Record<string, number> = {
  MUTE_1H: 60,
  MUTE_8H: 480,
};

async function setDeviceMute(muteMinutes: number, muteToken: string): Promise<void> {
  try {
    const res = await fetch(`${CLOUD_SERVICE_URL}/api/v1/notifications/mute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: muteToken, mute_minutes: muteMinutes }),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    log.info(`push notifications snoozed for ${muteMinutes}m`);
  } catch (err) {
    log.warn('failed to snooze push notifications:', err);
  }
}

export function usePushHandler(): void {
  if (!isCapacitor) return;

  const router = useRouter();

  (async () => {
    const { FirebaseMessaging, Importance } = await import('@capacitor-firebase/messaging');

    if (Capacitor.getPlatform() === 'android') {
      try {
        await FirebaseMessaging.createChannel({ id: 'default', name: 'Notifications', importance: Importance.High });
        await FirebaseMessaging.createChannel({ id: 'critical', name: 'Critical alerts', importance: Importance.Max });
      } catch (err) {
        log.warn('failed to create notification channels:', err);
      }
    }

    await FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
      const data = (event.notification?.data ?? {}) as unknown as Record<string, string>;

      const muteMinutes = MUTE_MINUTES[event.actionId];
      if (muteMinutes) {
        if (data.mute_token) setDeviceMute(muteMinutes, data.mute_token);
        return;
      }

      const intent = intentFromTapData(data);
      if (!intent) return;

      if (intent.kind === 'open-server' && (!intent.serverId || intent.serverId === getCurrentServerId())) {
        if (intent.deepLink) router.push(intent.deepLink);
        return;
      }

      (async () => {
        await writePendingIntent(intent);
        await bounceToCloudFrontend();
      })();
    });
  })().catch((err) => {
    log.warn('failed to attach listeners:', err);
  });
}
