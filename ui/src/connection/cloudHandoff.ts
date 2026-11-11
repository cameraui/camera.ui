import { CLOUD_SERVICE_URL, PROXY_SERVICE_HOST } from '@/common/constants.js';

import { getBootResult } from './bootApp.js';
import { forgetSelectedDirectServer, getDirectServer } from './directServer.js';
import { isCapacitor, showSplashScreen } from './runtime.js';

let _bouncing = false;

export function getCurrentServerId(): string | null {
  try {
    return getBootResult().cloudSession?.state.value?.serverId ?? null;
  } catch {
    // boot not done yet
    return null;
  }
}

export function getServerKey(): string | null {
  return getCurrentServerId() ?? getDirectServer()?.id ?? null;
}

export function getServerName(): string | null {
  const direct = getDirectServer();
  if (direct) return direct.name;
  try {
    return getBootResult().serverName ?? null;
  } catch {
    return null;
  }
}

export function isInAppSession(): boolean {
  return isInCloudSession() || getDirectServer() !== null;
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
      Preferences.remove({ key: 'currentServerName' }),
      Preferences.remove({ key: 'cloudApiBase' }),
      SecureStorage.remove('proxyAuthToken'),
      SecureStorage.remove('proxyRefreshToken'),
      forgetSelectedDirectServer(),
    ]);
  } catch {
    // the bounce and reload go ahead anyway
  }
}

export async function clearCloudHandoff(): Promise<void> {
  try {
    getBootResult().cloudSession?.clear();
  } catch {
    // boot not done, nothing in memory yet
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

  await showSplashScreen();
  await clearCloudHandoff();

  if (isCapacitor) {
    window.location.replace('../index.html');
    return;
  }

  if (window.location.host === PROXY_SERVICE_HOST) {
    window.location.replace(CLOUD_SERVICE_URL);
  }
}
