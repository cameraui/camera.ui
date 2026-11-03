import { registerNotifierDeviceFn } from '@/api/routes/notifications.js';
import { NVR_PLUGIN_NAME } from '@/common/constants.js';
import { getPushDeviceId } from '@/common/deviceId';
import { getCurrentServerId, isCapacitor } from '@/connection/index.js';

import type { NotifierDeviceWithSource } from '@shared/types';

const log = useLogger('PushRegistration');

const PREF_KEY_REGISTRATIONS = 'cui.push.registrations';

interface PerServerRegistration {
  deviceId: string;
  enabledAt: number;
}

interface PushCryptoPlugin {
  getOrCreateKey(options: { serverId: string }): Promise<{ key: string }>;
  deleteKey(options: { serverId: string }): Promise<void>;
}

type PushRegistrations = Record<string, PerServerRegistration>;

export type PushSyncStatus = 'unknown' | 'unregistered' | 'key-mismatch' | 'registered';

export interface PushSyncState {
  status: PushSyncStatus;
  device?: NotifierDeviceWithSource;
}

const _registering = ref(false);

let _pushCrypto: Promise<{ plugin: PushCryptoPlugin | null }> | null = null;

export function usePushRegistration() {
  const registerForPush = async (): Promise<void> => {
    if (!isCapacitor || _registering.value) return;
    _registering.value = true;

    try {
      const serverId = getCurrentServerId();
      if (!serverId) return;

      const deviceId = await getPushDeviceId();
      if (!deviceId) return;

      const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
      const perm = await FirebaseMessaging.requestPermissions();
      if (perm.receive !== 'granted') log.warn('push permission not granted:', perm.receive);

      const platform = await detectPlatform();
      const deviceName = await detectDeviceName();
      const pushKey = await getOrCreatePushKey(serverId);
      if (!pushKey) throw new Error('push key unavailable');

      const device = await registerNotifierDeviceFn({
        pluginName: NVR_PLUGIN_NAME,
        input: { deviceId, platform, deviceName, pushKey },
      });

      await writeRegistration(serverId, { deviceId: device.id, enabledAt: Date.now() });
    } catch (err) {
      // rethrow so the settings view can toast
      log.warn('failed to enable push for server:', err);
      throw err;
    } finally {
      _registering.value = false;
    }
  };

  const forgetIfThisDevice = async (serverId: string, deviceId: string): Promise<void> => {
    if (!serverId) return;
    const reg = await readRegistration(serverId);
    if (!reg || reg.deviceId !== deviceId) return;
    await removeRegistration(serverId);
    await deletePushKey(serverId);
  };

  const getSyncState = async (serverId: string, devices: NotifierDeviceWithSource[] | undefined): Promise<PushSyncState> => {
    if (!isCapacitor || !serverId || !devices) return { status: 'unknown' };

    const deviceHash = await fingerprint(await getPushDeviceId());
    if (!deviceHash) return { status: 'unknown' };

    const mine = devices.find((device) => device.pluginName === NVR_PLUGIN_NAME && device.metadata?.deviceHash === deviceHash);
    if (!mine) return { status: 'unregistered' };

    const localKey = await getOrCreatePushKey(serverId);
    const localKeyHash = localKey ? await fingerprint(localKey) : '';
    if ((mine.metadata?.keyHash ?? '') !== localKeyHash) return { status: 'key-mismatch', device: mine };

    return { status: 'registered', device: mine };
  };

  const restoreMarker = async (serverId: string, deviceId: string): Promise<void> => {
    if (await readRegistration(serverId)) return;
    await writeRegistration(serverId, { deviceId, enabledAt: Date.now() });
  };

  return {
    registerForPush,
    forgetIfThisDevice,
    getSyncState,
    restoreMarker,
  };
}

async function fingerprint(value: string): Promise<string> {
  if (!value || !globalThis.crypto?.subtle) return '';
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

async function readRegistrations(): Promise<PushRegistrations> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: PREF_KEY_REGISTRATIONS });
    if (!value) return {};
    return JSON.parse(value) as PushRegistrations;
  } catch {
    return {};
  }
}

async function writeRegistrations(regs: PushRegistrations): Promise<void> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: PREF_KEY_REGISTRATIONS, value: JSON.stringify(regs) });
  } catch {
    // best-effort
  }
}

async function readRegistration(serverId: string): Promise<PerServerRegistration | null> {
  const regs = await readRegistrations();
  return regs[serverId] ?? null;
}

async function writeRegistration(serverId: string, entry: PerServerRegistration): Promise<void> {
  const regs = await readRegistrations();
  regs[serverId] = entry;
  await writeRegistrations(regs);
}

async function removeRegistration(serverId: string): Promise<void> {
  const regs = await readRegistrations();
  if (!regs[serverId]) return;
  delete regs[serverId];
  await writeRegistrations(regs);
}

function pushCrypto(): Promise<{ plugin: PushCryptoPlugin | null }> {
  _pushCrypto ??= (async () => {
    try {
      const { Capacitor, registerPlugin } = await import('@capacitor/core');
      if (!Capacitor.isPluginAvailable('PushCrypto')) return { plugin: null };
      return { plugin: registerPlugin<PushCryptoPlugin>('PushCrypto') };
    } catch {
      return { plugin: null };
    }
  })();
  return _pushCrypto;
}

async function getOrCreatePushKey(serverId: string): Promise<string | null> {
  const { plugin } = await pushCrypto();
  if (!plugin) return null;
  try {
    const { key } = await plugin.getOrCreateKey({ serverId });
    return key || null;
  } catch (err) {
    log.warn('push key unavailable:', err);
    return null;
  }
}

async function deletePushKey(serverId: string): Promise<void> {
  try {
    const { plugin } = await pushCrypto();
    await plugin?.deleteKey({ serverId });
  } catch {
    // ignore
  }
}

async function detectPlatform(): Promise<'ios' | 'android'> {
  const { Capacitor } = await import('@capacitor/core');
  return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
}

async function detectDeviceName(): Promise<string> {
  let model = '';

  try {
    const { Device } = await import('@capacitor/device');
    const info = await Device.getInfo();
    model = info.name || info.model || '';
  } catch {
    // falls through to the platform name below
  }

  if (!model) {
    try {
      const { Capacitor } = await import('@capacitor/core');
      model = Capacitor.getPlatform() === 'ios' ? 'iPhone' : 'Android';
    } catch {
      model = 'Mobile';
    }
  }

  const auth = useAuthStore();
  const username = auth.user?.username;
  return username ? `${model} (${username})` : model;
}
