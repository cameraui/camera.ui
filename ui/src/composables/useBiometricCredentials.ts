import { isCapacitor } from '@/connection/index.js';

const KEY_USERNAME_PREFIX = 'cui.creds.username:';
const KEY_PASSWORD_PREFIX = 'cui.creds.password:';

export interface StoredCredentials {
  username: string;
  password: string;
}

export interface BiometryStatus {
  available: boolean;
  enrolled: boolean;
  reason?: string;
}

export async function checkBiometryAvailable(): Promise<BiometryStatus> {
  if (!isCapacitor) return { available: false, enrolled: false };
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
    const result = await BiometricAuth.checkBiometry();
    return {
      available: result.isAvailable,
      enrolled: result.isAvailable,
      reason: result.reason,
    };
  } catch {
    return { available: false, enrolled: false };
  }
}

export async function hasStoredCredentials(serverId: string | null): Promise<boolean> {
  if (!isCapacitor || !serverId) return false;
  try {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    const username = await SecureStorage.get(KEY_USERNAME_PREFIX + serverId);
    return typeof username === 'string' && username.length > 0;
  } catch {
    return false;
  }
}

export async function saveCredentials(serverId: string, creds: StoredCredentials): Promise<void> {
  if (!isCapacitor) return;
  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
  await SecureStorage.set(KEY_USERNAME_PREFIX + serverId, creds.username);
  await SecureStorage.set(KEY_PASSWORD_PREFIX + serverId, creds.password);
}

export async function clearCredentials(serverId: string | null): Promise<void> {
  if (!isCapacitor || !serverId) return;
  try {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    await SecureStorage.remove(KEY_USERNAME_PREFIX + serverId);
    await SecureStorage.remove(KEY_PASSWORD_PREFIX + serverId);
  } catch {
    // best-effort
  }
}

export async function unlockCredentials(serverId: string | null, reason: string): Promise<StoredCredentials | null> {
  if (!isCapacitor || !serverId) return null;

  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
  try {
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: 'Cancel',
      allowDeviceCredential: true,
      iosFallbackTitle: 'Use passcode',
    });
  } catch {
    return null;
  }

  try {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    const username = await SecureStorage.get(KEY_USERNAME_PREFIX + serverId);
    const password = await SecureStorage.get(KEY_PASSWORD_PREFIX + serverId);
    if (typeof username !== 'string' || typeof password !== 'string') return null;
    return { username, password };
  } catch {
    return null;
  }
}
