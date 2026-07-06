import { CLOUD_SERVICE_URL } from '@/common/constants.js';
import { isCapacitor } from '@/connection/index.js';

const PREF_KEY = 'updateChannel';
const BASE_URL = `${CLOUD_SERVICE_URL}/api/updates/latest`;

type Channel = 'production' | 'beta';

const _channel = ref<Channel>('production');
let _loaded = false;

export function useUpdateChannel() {
  const ensureLoaded = async (): Promise<void> => {
    if (_loaded || !isCapacitor) {
      _loaded = true;
      return;
    }
    try {
      const { Preferences } = await import('@capacitor/preferences');
      const stored = await Preferences.get({ key: PREF_KEY });
      if (stored.value === 'beta') _channel.value = 'beta';
    } catch {
      // first-launch / plugin not ready — defaults to production
    } finally {
      _loaded = true;
    }
  };

  const setChannel = async (next: Channel): Promise<void> => {
    if (!isCapacitor) return;
    if (next === _channel.value) return;
    _channel.value = next;

    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: PREF_KEY, value: next });

    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    const url = next === 'beta' ? `${BASE_URL}?channel=beta` : BASE_URL;
    await CapacitorUpdater.setUpdateUrl({ url });
  };

  return {
    channel: _channel,
    ensureLoaded,
    setChannel,
  };
}
