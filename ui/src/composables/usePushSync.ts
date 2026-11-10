import { NotificationsQuery } from '@/api/routes/notifications.js';
import { serverFlags } from '@/common/serverFlags.js';
import { getCurrentServerId, isCapacitor } from '@/connection/index.js';

import type { NotifierDeviceWithSource } from '@shared/types';

const log = useLogger('PushSync');

const DEVICES_KEY = ['notifications', 'devices'];
const RETRY_DELAYS = [15_000, 60_000, 300_000];

const dismissed = serverFlags('cui.push.syncDismissed');

const needsAction = ref(false);
const repairing = ref(false);

let evaluating = false;

export function usePushSync() {
  const authStore = useAuthStore();
  const instanceStore = useInstanceStore();
  const { isLoggedIn } = storeToRefs(authStore);

  const { registerForPush, getSyncState, mayAutoSync, restoreMarker } = usePushRegistration();

  const notificationsQuery = new NotificationsQuery();
  const { queryClient } = notificationsQuery;
  const { data: settings } = notificationsQuery.getSettingsQuery();
  const { data: devices } = notificationsQuery.listDevicesQuery(() => isCapacitor && isLoggedIn.value);

  let pending = false;
  let retries = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  // the push keys belong to the home server, a remote's device list says nothing about them
  const active = computed(() => isCapacitor && isLoggedIn.value && instanceStore.isHomeActive && settings.value?.enabled === true);

  async function evaluate(list: NotifierDeviceWithSource[] | undefined = devices.value): Promise<void> {
    if (!active.value || evaluating) return;
    evaluating = true;

    try {
      const serverId = getCurrentServerId();
      if (!serverId) return;

      const state = await getSyncState(serverId, list);
      if (state.status !== 'key-mismatch') {
        needsAction.value = false;
        pending = false;
        stopRetry();
        if (state.status === 'registered' && state.device) {
          await restoreMarker(serverId, state.device.id);
          // healthy again, so a later break is allowed to speak up
          await dismissed.set(serverId, false);
        } else if (state.status === 'unregistered' && (await mayAutoSync(serverId))) {
          await registerSilently();
        }
        return;
      }

      if (await registerSilently()) {
        needsAction.value = false;
        return;
      }

      needsAction.value = !(await dismissed.has(serverId));
    } catch (error) {
      log.warn('could not evaluate push sync state:', error);
    } finally {
      evaluating = false;
    }
  }

  async function registerSilently(): Promise<boolean> {
    pending = true;
    try {
      const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
      if ((await FirebaseMessaging.checkPermissions()).receive !== 'granted') return false;

      await registerForPush();
      pending = false;
      retries = 0;
      await queryClient.invalidateQueries({ queryKey: DEVICES_KEY });
      return true;
    } catch (error) {
      log.warn('silent push registration failed:', error);
      scheduleRetry();
      return false;
    }
  }

  function scheduleRetry(): void {
    if (retryTimer || retries >= RETRY_DELAYS.length) return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      retries++;
      recheck();
    }, RETRY_DELAYS[retries]);
  }

  function stopRetry(): void {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  }

  async function recheck(): Promise<void> {
    await queryClient.refetchQueries({ queryKey: DEVICES_KEY });
    await evaluate(queryClient.getQueryData<NotifierDeviceWithSource[]>(DEVICES_KEY));
  }

  async function repair(): Promise<void> {
    repairing.value = true;
    try {
      await registerForPush();
      await queryClient.invalidateQueries({ queryKey: DEVICES_KEY });
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
    if (serverId) await dismissed.set(serverId, true);
  }

  watch([active, devices], () => evaluate(), { immediate: true });

  watch(active, (on) => {
    if (on) return;
    stopRetry();
    pending = false;
  });

  // a permission granted in the system settings or a plugin that came up meanwhile
  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible' && pending && active.value) recheck();
  });

  tryOnScopeDispose(stopRetry);

  return {
    needsAction: computed(() => needsAction.value && active.value),
    repairing: computed(() => repairing.value),
    repair,
    dismiss,
  };
}
