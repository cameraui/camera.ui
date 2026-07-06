import { localStorageAdapter } from '@camera.ui/transport';

import { isCapacitor } from '../runtime.js';

import type { StorageAdapter } from '@camera.ui/transport';

export function createStorageAdapter(): StorageAdapter {
  if (isCapacitor) {
    return createSecureStorageAdapter();
  }
  return localStorageAdapter();
}

function createSecureStorageAdapter(): StorageAdapter {
  return {
    async get(key) {
      const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
      const value = await SecureStorage.get(key);
      return typeof value === 'string' ? value : null;
    },
    async set(key, value) {
      const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
      await SecureStorage.set(key, value);
    },
    async del(key) {
      const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
      await SecureStorage.remove(key);
    },
  };
}
