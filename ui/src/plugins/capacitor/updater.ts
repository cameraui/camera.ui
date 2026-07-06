import { isCapacitor } from '@/connection/index.js';

export function registerUpdater() {
  if (!isCapacitor) return;
  import('@capgo/capacitor-updater').then(({ CapacitorUpdater }) => {
    CapacitorUpdater.notifyAppReady();
  });
}
