import { CLOUD_SERVICE_URL } from '@/common/constants.js';
import { isCapacitor } from '@/connection/index.js';

const PREF_KEY = 'updateChannel';
const BASE_URL = `${CLOUD_SERVICE_URL}/api/updates/latest`;

type Channel = 'production' | 'beta';

const _channel = useLocalStorage<Channel>(PREF_KEY, 'production');
let _nativeSynced = false;

async function applyNativeUrl(): Promise<void> {
  if (!isCapacitor) return;
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    const url = _channel.value === 'beta' ? `${BASE_URL}?channel=beta` : BASE_URL;
    await CapacitorUpdater.setUpdateUrl({ url });
  } catch {
    // plugin not ready — retried on the next setChannel / ensureLoaded
  }
}

export function useUpdateChannel() {
  const isBeta = computed(() => _channel.value === 'beta');

  const ensureLoaded = async (): Promise<void> => {
    if (_nativeSynced || !isCapacitor) {
      _nativeSynced = true;
      return;
    }
    _nativeSynced = true;
    try {
      const { Preferences } = await import('@capacitor/preferences');
      const stored = await Preferences.get({ key: PREF_KEY });
      if (stored.value === 'beta' && _channel.value !== 'beta') _channel.value = 'beta';
    } catch {
      // first-launch / plugin not ready — keep the localStorage value
    }
    await applyNativeUrl();
  };

  const setChannel = async (next: Channel): Promise<void> => {
    if (next === _channel.value) return;
    _channel.value = next;
    await applyNativeUrl();
  };

  return {
    channel: _channel,
    isBeta,
    ensureLoaded,
    setChannel,
  };
}
