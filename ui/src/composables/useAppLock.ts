import { isCapacitor } from '@/connection/index.js';

const LOCK_AFTER_BG_MS = 5 * 60 * 1000;
const SETTINGS_PREFS_KEY = 'cameraui:settings-prefs:v1';
const UNLOCKED_FLAG = 'cameraui:unlocked';

function isAppLockEnabled(): boolean {
  try {
    const raw = localStorage.getItem(SETTINGS_PREFS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { appLock?: boolean };
    return parsed?.appLock === true;
  } catch {
    return false;
  }
}

function markUnlocked(): void {
  try {
    sessionStorage.setItem(UNLOCKED_FLAG, '1');
  } catch {
    // sessionStorage unavailable — degrade gracefully.
  }
}

function clearUnlocked(): void {
  try {
    sessionStorage.removeItem(UNLOCKED_FLAG);
  } catch {
    // no-op
  }
}

const _isLocked = ref(false);
const _isAvailable = ref(false);
let _bgTimestamp: number | null = null;
let _initialised = false;

export function useAppLock() {
  return {
    isLocked: _isLocked,
    isAvailable: _isAvailable,
    unlock,
    init: initOnce,
  };
}

async function checkAvailability(): Promise<boolean> {
  if (!isCapacitor) return false;
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
    const result = await BiometricAuth.checkBiometry();
    return result.isAvailable;
  } catch {
    return false;
  }
}

export async function unlock(): Promise<boolean> {
  if (!isCapacitor) {
    _isLocked.value = false;
    markUnlocked();
    return true;
  }
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
    await BiometricAuth.authenticate({
      reason: 'Unlock camera.ui',
      cancelTitle: 'Cancel',
      allowDeviceCredential: true,
      iosFallbackTitle: 'Use passcode',
    });
    _isLocked.value = false;
    _bgTimestamp = null;
    markUnlocked();
    return true;
  } catch {
    return false;
  }
}

async function initOnce(): Promise<void> {
  if (_initialised || !isCapacitor) return;
  _initialised = true;

  _isAvailable.value = await checkAvailability();

  // Edge: pref says lock-on but biometric is no longer configured (user
  // disabled Face ID after enabling lock). Don't trap them in a lock loop.
  if (!_isAvailable.value) return;

  const { App } = await import('@capacitor/app');
  App.addListener('appStateChange', ({ isActive }) => {
    if (!isAppLockEnabled() || !_isAvailable.value) {
      _isLocked.value = false;
      _bgTimestamp = null;
      clearUnlocked();
      return;
    }

    if (!isActive) {
      _bgTimestamp = Date.now();
      return;
    }

    // Resumed: re-lock if backgrounded long enough. Clearing the unlocked
    // flag ensures a subsequent bundle-switch (e.g. via "Switch Server")
    // sees the lock state too.
    if (_bgTimestamp && Date.now() - _bgTimestamp > LOCK_AFTER_BG_MS) {
      _isLocked.value = true;
      clearUnlocked();
    }
    _bgTimestamp = null;
  });
}
