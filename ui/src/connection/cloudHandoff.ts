import { CLOUD_SERVICE_URL, PROXY_SERVICE_HOST } from '@/common/constants.js';

import { getBootResult } from './bootApp.js';
import { isCapacitor } from './runtime.js';

let _bouncing = false;

export function getCurrentServerId(): string | null {
  try {
    return getBootResult().cloudSession?.state.value?.serverId ?? null;
  } catch {
    // boot not done yet — caller probably ran too early
    return null;
  }
}

export async function clearCapacitorCloudPreferences(): Promise<void> {
  if (!isCapacitor) return;
  try {
    const [{ Preferences }, { SecureStorage }] = await Promise.all([import('@capacitor/preferences'), import('@aparajita/capacitor-secure-storage')]);
    await Promise.all([
      Preferences.remove({ key: 'mobileOrigin' }),
      Preferences.remove({ key: 'proxyTokenExpiresAt' }),
      Preferences.remove({ key: 'proxyRefreshTokenExpiresAt' }),
      Preferences.remove({ key: 'currentServerId' }),
      Preferences.remove({ key: 'cloudApiBase' }),
      SecureStorage.remove('proxyAuthToken'),
      SecureStorage.remove('proxyRefreshToken'),
    ]);
  } catch {
    // best-effort — bounce + reload proceeds regardless
  }
}

export async function clearCloudHandoff(): Promise<void> {
  try {
    getBootResult().cloudSession?.clear();
  } catch {
    // boot not done — nothing to clear in memory yet
  }
  await clearCapacitorCloudPreferences();
}

export function isInCloudSession(): boolean {
  try {
    return getBootResult().mode === 'cloud';
  } catch {
    return false;
  }
}

export async function bounceToCloudFrontend(): Promise<void> {
  if (_bouncing) return;
  _bouncing = true;

  if (isCapacitor) {
    try {
      const { SplashScreen } = await import('@capacitor/splash-screen');
      await SplashScreen.show({ autoHide: false, fadeInDuration: 0 });
    } catch {
      // ignore
    }
  }

  await clearCloudHandoff();

  if (isCapacitor) {
    window.location.replace('../index.html');
    return;
  }

  if (window.location.host === PROXY_SERVICE_HOST) {
    window.location.replace(CLOUD_SERVICE_URL);
  }
}
