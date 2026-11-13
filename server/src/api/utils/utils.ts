import { randomInt } from 'node:crypto';

import { INGRESS_DEVICE_PREFIX, PROXY_AUTH_DEVICE_PREFIX } from '../../services/config/constants.js';
import { passwordSchema } from '../schemas/users.schema.js';

import type { DBRoles } from '../database/types.js';

const START_PASSWORD_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function isManagedDevice(deviceId: string | undefined): boolean {
  return !!deviceId && (deviceId.startsWith(INGRESS_DEVICE_PREFIX) || deviceId.startsWith(PROXY_AUTH_DEVICE_PREFIX));
}

export function isPanelViewer(role: DBRoles, deviceId: string | undefined): boolean {
  // a Home Assistant user without admin rights, the panel signs it in and it can not set a password there
  return role !== 'master' && !!deviceId?.startsWith(INGRESS_DEVICE_PREFIX);
}

export function generateStartPassword(): string {
  const group = () => Array.from({ length: 4 }, () => START_PASSWORD_ALPHABET[randomInt(START_PASSWORD_ALPHABET.length)]).join('');

  let password = '';
  do {
    password = [group(), group(), group()].join('-');
  } while (!passwordSchema.safeParse(password).success);
  return password;
}
