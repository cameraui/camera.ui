import { isCapacitor } from '@/connection/index.js';

export function useAppVersion() {
  const { electron } = useElectron();

  const uiVersion = __UI_VERSION__;
  const appVersion = ref<string | null>(null);
  const nativeVersion = ref<string | null>(null);

  const refreshAppVersion = async (): Promise<void> => {
    if (isCapacitor) {
      try {
        const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
        const current = await CapacitorUpdater.current();
        appVersion.value = current?.bundle?.version ?? null;
        nativeVersion.value = current?.native ?? null;
      } catch {
        appVersion.value = null;
        nativeVersion.value = null;
      }
      return;
    }
    if (electron) {
      try {
        const v = await electron.invoke('get-app-version');
        appVersion.value = typeof v === 'string' ? v : null;
      } catch {
        appVersion.value = null;
      }
    }
  };

  return {
    uiVersion,
    appVersion,
    nativeVersion,
    refreshAppVersion,
  };
}
