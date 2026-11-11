import { entryScriptSrc } from '@/common/appEntry.js';
import { isEmbedded, runtimeBase } from '@/common/base.js';
import { isCapacitor, useConnection } from '@/connection/index.js';
import { i18n } from '@/i18n/index.js';
import { useRegisterSW } from 'virtual:pwa-register/vue';

const log = useLogger('AppUpdate');

const SW_UPDATE_INTERVAL_MS = 60 * 60 * 1000;
const SW_VISIBLE_CHECK_GAP_MS = 10 * 60 * 1000;
const SW_RELOADED_FLAG = 'cui-sw-updated';
const ENTRY_CHECK_TIMEOUT_MS = 10_000;

const updateAvailable = ref(false);
const isApplying = ref(false);
let applyImpl: () => Promise<void> = async () => {};

let registration: ServiceWorkerRegistration | undefined;
let lastSWCheck = 0;

async function checkSWForUpdate() {
  if (!registration || registration.installing || !navigator.onLine) return;
  lastSWCheck = Date.now();
  try {
    await registration.update();
  } catch {
    // ignore
  }
}

async function checkEntryForUpdate(): Promise<void> {
  const running = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src;
  if (updateAvailable.value || !running) return;
  try {
    const indexUrl = new URL(runtimeBase(), window.location.origin).href;
    const response = await fetch(indexUrl, { cache: 'no-store', signal: AbortSignal.timeout(ENTRY_CHECK_TIMEOUT_MS) });
    if (!response.ok) return;
    const served = entryScriptSrc(await response.text(), response.url || indexUrl);
    if (!served || served === running) return;
  } catch {
    return;
  }

  applyImpl = async () => {
    sessionStorage.setItem(SW_RELOADED_FLAG, '1');
    window.location.reload();
  };
  updateAvailable.value = true;
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
  // isApplying stays set on success, the page reloads
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
  } else if (!isEmbedded()) {
    setupServiceWorkerUpdates();
  }
}

async function setupCapacitorUpdates(): Promise<void> {
  const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
  const offerReload = () => {
    applyImpl = async () => {
      await CapacitorUpdater.reload();
    };
    updateAvailable.value = true;
  };

  CapacitorUpdater.addListener('updaterEvent', (event) => {
    if (event.type === 'updateAvailable') offerReload();
  });

  try {
    const [next, { bundle }] = await Promise.all([CapacitorUpdater.getNextBundle(), CapacitorUpdater.current()]);
    if (next && next.id !== bundle.id && (next.status === 'pending' || next.status === 'success')) offerReload();
  } catch {
    // the next update check announces it again
  }
}

function setupServiceWorkerUpdates(): void {
  const { t } = i18n.global;
  const toast = useCuiToast();
  let entryCheck = !('serviceWorker' in navigator);

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, r) {
      registration = r;
      if (!registration) return;
      lastSWCheck = Date.now();
      setInterval(() => checkSWForUpdate(), SW_UPDATE_INTERVAL_MS);
    },
    onRegisterError() {
      entryCheck = true;
    },
  });

  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastSWCheck >= SW_VISIBLE_CHECK_GAP_MS) checkSWForUpdate();
  });

  const connection = useConnection();
  // the first connect after a page load runs the bundle that load just fetched
  let connectedBefore = connection.isOnline.value;
  watch(
    () => connection.isOnline.value,
    (online, wasOnline) => {
      if (!online || wasOnline) return;
      checkSWForUpdate();
      if (entryCheck && connectedBefore) checkEntryForUpdate();
      connectedBefore = true;
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

  // confirm the reload once the toaster mounts, it sits behind the loading screen at first
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
