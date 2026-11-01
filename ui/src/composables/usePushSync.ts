import { NotificationsQuery } from '@/api/routes/notifications.js';
import { getCurrentServerId, isCapacitor } from '@/connection/index.js';

const log = useLogger('PushSync');

const PREF_KEY_DISMISSED = 'cui.push.syncDismissed';

const needsAction = ref(false);
const repairing = ref(false);

let evaluating = false;

export function usePushSync() {
  const authStore = useAuthStore();
  const instanceStore = useInstanceStore();
  const { isLoggedIn } = storeToRefs(authStore);

  const { registerForPush, getSyncState, restoreMarker } = usePushRegistration();

  const notificationsQuery = new NotificationsQuery();
  const { data: settings } = notificationsQuery.getSettingsQuery();
  const { data: devices } = notificationsQuery.listDevicesQuery(() => isCapacitor && isLoggedIn.value);

  // the push keys belong to the home server, a remote's device list says nothing about them
  const active = computed(() => isCapacitor && isLoggedIn.value && instanceStore.isHomeActive && settings.value?.enabled === true);

  async function evaluate(): Promise<void> {
    if (!active.value || evaluating) return;
    evaluating = true;

    try {
      const serverId = getCurrentServerId();
      if (!serverId) return;

      const state = await getSyncState(serverId, devices.value);
      if (state.status !== 'key-mismatch') {
        needsAction.value = false;
        if (state.status === 'registered' && state.device) {
          await restoreMarker(serverId, state.device.id);
          // healthy again, so a later break is allowed to speak up
          await clearDismissed(serverId);
        }
        return;
      }

      if (await repairSilently()) {
        needsAction.value = false;
        return;
      }

      needsAction.value = !(await isDismissed(serverId));
    } catch (error) {
      log.warn('could not evaluate push sync state:', error);
    } finally {
      evaluating = false;
    }
  }

  async function repairSilently(): Promise<boolean> {
    try {
      const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
      if ((await FirebaseMessaging.checkPermissions()).receive !== 'granted') return false;

      await registerForPush();
      await notificationsQuery.queryClient.invalidateQueries({ queryKey: ['notifications', 'devices'] });
      return true;
    } catch (error) {
      log.warn('silent push repair failed:', error);
      return false;
    }
  }

  async function repair(): Promise<void> {
    repairing.value = true;
    try {
      await registerForPush();
      await notificationsQuery.queryClient.invalidateQueries({ queryKey: ['notifications', 'devices'] });
      needsAction.value = false;
    } catch (error) {
      log.warn('push repair failed:', error);
    } finally {
      repairing.value = false;
    }
  }

  async function dismiss(): Promise<void> {
    needsAction.value = false;
    const serverId = getCurrentServerId();
    if (serverId) await writeDismissed(serverId);
  }

  watch([active, devices], () => evaluate(), { immediate: true });

  return {
    needsAction: computed(() => needsAction.value && active.value),
    repairing: computed(() => repairing.value),
    repair,
    dismiss,
  };
}

async function readDismissed(): Promise<Record<string, boolean>> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: PREF_KEY_DISMISSED });
    return value ? (JSON.parse(value) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

async function isDismissed(serverId: string): Promise<boolean> {
  return (await readDismissed())[serverId] === true;
}

async function writeDismissed(serverId: string): Promise<void> {
  await patchDismissed(serverId, true);
}

async function clearDismissed(serverId: string): Promise<void> {
  const all = await readDismissed();
  if (!all[serverId]) return;
  await patchDismissed(serverId, false);
}

async function patchDismissed(serverId: string, dismissed: boolean): Promise<void> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const all = await readDismissed();
    if (dismissed) all[serverId] = true;
    else delete all[serverId];
    await Preferences.set({ key: PREF_KEY_DISMISSED, value: JSON.stringify(all) });
  } catch {
    // ignore
  }
}
