import { sleep } from '@camera.ui/common/utils';

import { homeOrigin } from '@/common/base.js';

import type { Endpoint, Tokens } from '@camera.ui/transport';
import type { Connection, LoginUserData } from './types.js';

const EMBED_TOKEN_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const ME_RETRIES = 3;
const ME_RETRY_DELAY_MS = 300;

async function fetchEmbedUser(url: string): Promise<EmbedUser | null> {
  for (let attempt = 0; attempt < ME_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return (await res.json()) as EmbedUser;
      if (res.status === 401 || res.status === 403) return null;
    } catch {
      // network-level failure, fall through to retry
    }
    if (attempt < ME_RETRIES - 1) await sleep(ME_RETRY_DELAY_MS);
  }
  return null;
}

interface EmbedUser {
  _id?: string;
  username?: string;
  email?: string;
  role?: string;
  firstLogin?: boolean;
  avatar?: string;
}

export interface ConsumeEmbedSessionOptions {
  readonly onUser?: (user: LoginUserData) => void;
}

export async function consumeEmbedSession(connection: Connection, options: ConsumeEmbedSessionOptions = {}): Promise<boolean> {
  const base = homeOrigin();

  const user = await fetchEmbedUser(`${base}/api/auth/me`);
  if (!user || !user._id || !user.username || !user.role) return false;

  const endpoint: Endpoint = { url: base, mode: 'direct-lan', priority: 0 };
  const tokens: Tokens = { access: 'embed', accessExpiresAt: Date.now() + EMBED_TOKEN_TTL_MS };
  await connection.seedAndRetry({ endpoint, tokens }, 'home');

  options.onUser?.({
    _id: user._id,
    username: user.username,
    email: user.email,
    role: user.role,
    firstLogin: user.firstLogin,
    avatar: user.avatar,
  });
  return true;
}
