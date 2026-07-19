import { homeOrigin } from '@/common/base.js';
import { CLOUD_SERVICE_URL, PROXY_SERVICE_HOST } from '@/common/constants.js';

import { isCapacitor } from '../runtime.js';

import type { CloudSession, ConnectionMode } from '../types.js';

export interface DetectedMode {
  readonly mode: ConnectionMode;
  readonly directEndpointUrl?: string;
  readonly cloudSession?: CloudSession;
}

export async function detectMode(): Promise<DetectedMode> {
  if (isCapacitor) {
    return detectCapacitorMode();
  }
  if (isOnCloudProxyHost()) {
    return detectWebCloudMode();
  }
  return {
    mode: 'direct',
    directEndpointUrl: homeOrigin(),
  };
}

function isOnCloudProxyHost(): boolean {
  if (!PROXY_SERVICE_HOST) return false;
  return window.location.host === PROXY_SERVICE_HOST;
}

async function detectCapacitorMode(): Promise<DetectedMode> {
  const { Preferences } = await import('@capacitor/preferences');
  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
  const [origin, proxyToken, proxyRefresh, proxyTokenExp, proxyRefreshExp, serverId, cloudApiBase] = await Promise.all([
    Preferences.get({ key: 'mobileOrigin' }),
    SecureStorage.get('proxyAuthToken'),
    SecureStorage.get('proxyRefreshToken'),
    Preferences.get({ key: 'proxyTokenExpiresAt' }),
    Preferences.get({ key: 'proxyRefreshTokenExpiresAt' }),
    Preferences.get({ key: 'currentServerId' }),
    Preferences.get({ key: 'cloudApiBase' }),
  ]);

  const proxyTokenValue = typeof proxyToken === 'string' ? proxyToken : null;
  const proxyRefreshValue = typeof proxyRefresh === 'string' ? proxyRefresh : null;

  if (!origin.value || !proxyTokenValue) {
    return { mode: 'cloud' };
  }

  return {
    mode: 'cloud',
    cloudSession: {
      proxyUrl: origin.value,
      proxyToken: proxyTokenValue,
      proxyRefreshToken: proxyRefreshValue ?? undefined,
      proxyTokenExpiresAt: parseTimestamp(proxyTokenExp.value),
      proxyRefreshTokenExpiresAt: parseTimestamp(proxyRefreshExp.value),
      serverId: serverId.value ?? undefined,
      cloudApiBase: cloudApiBase.value ?? undefined,
    },
  };
}

function parseTimestamp(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

async function detectWebCloudMode(): Promise<DetectedMode> {
  try {
    const response = await fetch(`${CLOUD_SERVICE_URL}/api/proxy/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) return { mode: 'cloud' };
    const body = (await response.json()) as {
      proxy_url?: string;
      proxy_token?: string;
      proxy_refresh_token?: string;
      proxy_token_expires_at?: number;
      proxy_refresh_token_expires_at?: number;
      server_id?: string;
    };
    if (!body.proxy_token) return { mode: 'cloud' };
    return {
      mode: 'cloud',
      cloudSession: {
        proxyUrl: body.proxy_url ?? window.location.origin,
        proxyToken: body.proxy_token,
        proxyRefreshToken: body.proxy_refresh_token,
        proxyTokenExpiresAt: body.proxy_token_expires_at,
        proxyRefreshTokenExpiresAt: body.proxy_refresh_token_expires_at,
        serverId: body.server_id ?? undefined,
        cloudApiBase: CLOUD_SERVICE_URL,
      },
    };
  } catch {
    return { mode: 'cloud' };
  }
}
