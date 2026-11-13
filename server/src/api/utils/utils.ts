import { randomInt } from 'node:crypto';

import { INGRESS_DEVICE_PREFIX, PROXY_AUTH_DEVICE_PREFIX } from '../../services/config/constants.js';
import { passwordSchema } from '../schemas/users.schema.js';

import type { DBRoles, DBUser } from '../database/types.js';
import type { DBToken } from '../types/index.js';

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

export function mustSetPassword(user: DBUser, token: DBToken): boolean {
  // an API token was made in a session that had its password set
  return user.firstLogin && token.type !== 'api' && !isPanelViewer(user.role, token.device.id);
}

export function generateStartPassword(): string {
  const group = () => Array.from({ length: 4 }, () => START_PASSWORD_ALPHABET[randomInt(START_PASSWORD_ALPHABET.length)]).join('');

  let password = '';
  do {
    password = [group(), group(), group()].join('-');
  } while (!passwordSchema.safeParse(password).success);
  return password;
}
