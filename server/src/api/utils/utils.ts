import { INGRESS_DEVICE_PREFIX, PROXY_AUTH_DEVICE_PREFIX } from '../../services/config/constants.js';

export function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function isManagedDevice(deviceId: string | undefined): boolean {
  return !!deviceId && (deviceId.startsWith(INGRESS_DEVICE_PREFIX) || deviceId.startsWith(PROXY_AUTH_DEVICE_PREFIX));
}
