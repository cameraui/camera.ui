import { randomBytes } from 'node:crypto';

import type { AuthConfig } from './interfaces/config.js';

export function generateCredentials(): AuthConfig {
  const userBytes = randomBytes(8);
  const passwordBytes = randomBytes(16);

  const user = userBytes
    .toString('base64')
    .replace(/[+/=@:]/g, '')
    .slice(0, 8);
  const password = passwordBytes.toString('base64').replace(/[+/=@:]/g, '');

  return { user, password };
}

export async function safeAsync<R>(promise?: Promise<R>): Promise<R | null> {
  if (!promise) return null;
  try {
    return await promise;
  } catch {
    return null;
  }
}
