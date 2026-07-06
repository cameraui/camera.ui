import type { Endpoint, Tokens } from '@camera.ui/transport';
import type { Connection, LoginUserData } from './types.js';

interface AuthParamPayload {
  _sourceUrl?: string;
  _instanceName?: string;
  _reset?: boolean;
  _id?: string;
  username?: string;
  email?: string;
  role?: string;
  firstLogin?: boolean;
  avatar?: string;
  access_token?: string;
  refresh_token?: string;
  access_token_expires_at?: number;
  refresh_token_expires_at?: number;
}

export interface AuthParamRedirectInfo {
  sourceUrl: string;
  instanceName: string;
}

export interface ConsumeAuthParamOptions {
  readonly onUser?: (user: LoginUserData) => void;
  readonly onRedirectInfo?: (info: AuthParamRedirectInfo) => void;
  readonly onReset?: () => void;
}

export async function consumeAuthParam(connection: Connection, options: ConsumeAuthParamOptions = {}): Promise<boolean> {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  const authParam = hashParams.get('auth');
  if (!authParam) return false;
  hashParams.delete('auth');
  const remainingHash = hashParams.toString();
  const newHash = remainingHash ? `#${remainingHash}` : '';
  window.history.replaceState(null, '', window.location.pathname + window.location.search + newHash);

  let data: AuthParamPayload;
  try {
    data = JSON.parse(atob(authParam)) as AuthParamPayload;
  } catch {
    return false;
  }

  if (data._sourceUrl) {
    options.onRedirectInfo?.({
      sourceUrl: data._sourceUrl,
      instanceName: data._instanceName ?? 'Remote',
    });
  }

  let seeded = false;
  if (data.access_token && data._id && data.username && data.role) {
    const tokens: Tokens = {
      access: data.access_token,
      refresh: data.refresh_token,
      accessExpiresAt: data.access_token_expires_at,
      refreshExpiresAt: data.refresh_token_expires_at,
    };
    const endpoint: Endpoint = { url: window.location.origin, mode: 'direct-lan', priority: 0 };
    await connection.seedAndRetry({ endpoint, tokens }, 'home');
    seeded = true;
    options.onUser?.({
      _id: data._id,
      username: data.username,
      email: data.email,
      role: data.role,
      firstLogin: data.firstLogin,
      avatar: data.avatar,
    });
  }

  if (data._reset) {
    options.onReset?.();
  }

  return seeded;
}
