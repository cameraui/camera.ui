import { isCapacitor } from '@/connection/index.js';

const PUSH_ID_KEY = 'cui.device.pushId';
const WEB_PUSH_ID_KEY = 'cameraui:web-push-id';

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof window !== 'undefined' && typeof window.crypto !== 'undefined' && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function getPushDeviceId(): Promise<string> {
  if (isCapacitor) {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.getPlatform() === 'android') {
      const { Device } = await import('@capacitor/device');
      return (await Device.getId()).identifier;
    }
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    const existing = await SecureStorage.get(PUSH_ID_KEY);
    if (typeof existing === 'string' && existing) return existing;
    const id = generateUUID();
    await SecureStorage.set(PUSH_ID_KEY, id);
    return id;
  }
  let id = localStorage.getItem(WEB_PUSH_ID_KEY);
  if (!id) {
    id = generateUUID();
    localStorage.setItem(WEB_PUSH_ID_KEY, id);
  }
  return id;
}
