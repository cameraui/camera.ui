import { CLOUD_SERVICE_URL } from '@/common/constants.js';
import { intentFromTapData, writePendingIntent } from '@/common/pushIntent';
import { bounceToCloudFrontend, getCurrentServerId, isCapacitor } from '@/connection/index.js';

const log = useLogger('PushHandler');

const MUTE_ACTIONS = ['MUTE_CAMERA_1H', 'MUTE_ALL_1H'];
const MUTE_MINUTES = 60;

async function muteFromAction(actionId: string, data: Record<string, string>): Promise<void> {
  const body: Record<string, unknown> = { token: data.mute_token, mute_minutes: MUTE_MINUTES };
  // no keys: the push came through an older NVR plugin, both actions mute the whole device
  if (data.mute_keys) {
    if (actionId === 'MUTE_ALL_1H') body.all_cameras = true;
    else body.mute_keys = data.mute_keys.split(',');
  }

  try {
    const res = await fetch(`${CLOUD_SERVICE_URL}/api/v1/notifications/mute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    log.info(`push notifications snoozed for ${MUTE_MINUTES}m (${actionId})`);
  } catch (err) {
    log.warn('failed to snooze push notifications:', err);
  }
}

export function usePushHandler(): void {
  if (!isCapacitor) return;

  const router = useRouter();

  async function openOnHome(path: string): Promise<void> {
    await useInstanceStore().leaveRemote();
    await router.push(path);
  }

  (async () => {
    const { FirebaseMessaging, Importance } = await import('@capacitor-firebase/messaging');
    const { Capacitor } = await import('@capacitor/core');

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

      if (MUTE_ACTIONS.includes(event.actionId)) {
        if (data.mute_token) muteFromAction(event.actionId, data);
        return;
      }

      const intent = intentFromTapData(data);
      if (!intent) return;

      if (intent.kind === 'open-server' && (!intent.serverId || intent.serverId === getCurrentServerId())) {
        if (intent.deepLink) openOnHome(intent.deepLink);
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
