import { isCapacitor, useConnection } from '@/connection/index.js';
import { i18n } from '@/i18n/index.js';
import { useRegisterSW } from 'virtual:pwa-register/vue';

const log = useLogger('AppUpdate');

const SW_UPDATE_INTERVAL_MS = 60 * 60 * 1000; // hourly probe
const SW_RELOADED_FLAG = 'cui-sw-updated';

const updateAvailable = ref(false);
const isApplying = ref(false);
let applyImpl: () => Promise<void> = async () => {};

let registration: ServiceWorkerRegistration | undefined;

async function checkSWForUpdate() {
  if (!registration || registration.installing || !navigator.onLine) return;
  try {
    await registration.update();
  } catch {
    // ignore
  }
}

async function runApply(): Promise<void> {
  if (isApplying.value || !updateAvailable.value) return;
  isApplying.value = true;
  try {
    await applyImpl();
  } catch (err) {
    log.error('apply failed', err);
    isApplying.value = false;
  }
  // Don't reset isApplying on success — the page is about to reload, the
  // spinner stays until the navigation kicks in.
}

export function useAppUpdate() {
  return {
    updateAvailable,
    isApplying,
    applyUpdate: runApply,
  };
}

export function adoptUpdateIfPending(): void {
  if (!updateAvailable.value || isApplying.value) return;
  runApply();
}

export function setupAppUpdate() {
  if (isCapacitor) {
    setupCapacitorUpdates();
  } else {
    setupServiceWorkerUpdates();
  }
}

function setupCapacitorUpdates(): void {
  import('@capgo/capacitor-updater').then(({ CapacitorUpdater }) => {
    CapacitorUpdater.addListener('updateAvailable', () => {
      applyImpl = async () => {
        await CapacitorUpdater.reload();
      };
      updateAvailable.value = true;
    });
  });
}

function setupServiceWorkerUpdates(): void {
  const { t } = i18n.global;
  const toast = useCuiToast();
  // const queryClient = useQueryClient();

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, r) {
      registration = r;
      if (!registration) return;
      setInterval(() => checkSWForUpdate(), SW_UPDATE_INTERVAL_MS);
    },
  });

  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') checkSWForUpdate();
  });

  const connection = useConnection();
  watch(
    () => connection.isOnline.value,
    (online, wasOnline) => {
      if (online && !wasOnline) checkSWForUpdate();
    },
  );

  watch(needRefresh, (ready) => {
    if (!ready) return;
    applyImpl = async () => {
      sessionStorage.setItem(SW_RELOADED_FLAG, '1');
      let reloaded = false;
      const reload = () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      };

      navigator.serviceWorker?.addEventListener('controllerchange', reload, { once: true });
      await updateServiceWorker(false);
      setTimeout(reload, 20_000);
    };

    updateAvailable.value = true;
  });

  // After a reload that we initiated, confirm to the user it landed. Wait for
  // the toaster element to mount (it's behind the loading screen on first paint).
  if (sessionStorage.getItem(SW_RELOADED_FLAG)) {
    sessionStorage.removeItem(SW_RELOADED_FLAG);
    const observer = new MutationObserver(() => {
      if (document.querySelector('[data-sonner-toaster]')) {
        observer.disconnect();
        toast.add({
          severity: 'success',
          summary: t('components.toast.title_success'),
          detail: t('components.toast.update_installed_detail'),
          life: 3000,
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

export function checkAppUpdate(): void {
  if (isCapacitor) return;
  checkSWForUpdate();
}
