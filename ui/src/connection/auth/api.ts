import axios from 'axios';

import { installNativeHttp } from '../nativeHttp.js';

import type { JwtTokenResponse, SessionResponse, TwoFactorPendingResponse } from '@shared/types';
import type { AuthApi, LoginCredentials, LoginOutcome, LoginResult, ProxyMintResult, Tokens, TunnelAddresses } from '../types.js';

const log = useLogger('AuthApi');

interface LoginResponse extends JwtTokenResponse {
  username?: string;
  email?: string;
  _id?: string;
  role?: string;
  firstLogin?: boolean;
  avatar?: string;
  language?: string;
}

type LoginRawResponse = LoginResponse | TwoFactorPendingResponse;

interface ProxyMintResponse {
  proxy_url: string;
  proxy_token: string;
  proxy_refresh_token?: string;
  proxy_token_expires_at?: number;
  proxy_refresh_token_expires_at?: number;
}

const DEFAULT_DEVICE = { id: 'camera.ui-web', name: 'camera.ui-web' };

export function createAuthApi(): AuthApi {
  const httpClient = axios.create({
    timeout: 10_000,
  });

  installNativeHttp(httpClient);

  async function loginDirect(endpoint: string, credentials: LoginCredentials, signal?: AbortSignal): Promise<LoginOutcome> {
    const response = await httpClient.post<LoginRawResponse>(
      `${endpoint}/api/auth/login`,
      {
        username: credentials.username,
        password: credentials.password,
        kind: credentials.kind ?? 'web',
        persistent: credentials.persistent ?? true,
        device: credentials.device ?? DEFAULT_DEVICE,
      },
      { signal },
    );

    if (isTwoFactorPendingResponse(response.data)) {
      return {
        twoFactorPending: true,
        tempToken: response.data.tempToken,
        raw: response.data,
      };
    }

    return {
      tokens: extractTokens(response.data),
      user: extractUser(response.data),
      raw: response.data,
    };
  }

  async function verify2FA(endpoint: string, tempToken: string, code: string, signal?: AbortSignal): Promise<LoginResult> {
    const response = await httpClient.post<LoginResponse>(`${endpoint}/api/auth/verify-2fa`, { tempToken, code }, { signal });
    return {
      tokens: extractTokens(response.data),
      user: extractUser(response.data),
      raw: response.data,
    };
  }

  async function refreshDirect(endpoint: string, refreshToken: string, signal?: AbortSignal): Promise<LoginResult> {
    const response = await httpClient.post<JwtTokenResponse>(
      `${endpoint}/api/auth/refresh`,
      {
        refresh_token: refreshToken,
      },
      { signal },
    );
    return {
      tokens: extractTokens(response.data),
      raw: response.data,
    };
  }

  async function authCheck(endpoint: string, accessToken: string, signal?: AbortSignal): Promise<void> {
    await httpClient.get(`${endpoint}/api/auth/check`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    });
  }

  async function logoutDirect(endpoint: string, accessToken: string): Promise<void> {
    await httpClient.post(`${endpoint}/api/auth/logout`, null, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  async function tunnelCheck(proxyUrl: string, proxyToken: string, signal?: AbortSignal): Promise<TunnelAddresses> {
    if (!proxyUrl || !proxyToken) {
      throw new Error(`tunnelCheck: incomplete proxy session (proxyUrl=${proxyUrl ? 'set' : 'missing'}, proxyToken=${proxyToken ? 'set' : 'missing'})`);
    }
    const response = await httpClient.get<SessionResponse>(`${proxyUrl}/tunnel/check`, {
      headers: { 'X-Proxy-Session': proxyToken },
      timeout: 30_000,
      signal,
    });
    const internalAddresses = Array.isArray(response.data.internalAddresses) ? response.data.internalAddresses : [];
    const externalAddresses = Array.isArray(response.data.externalAddresses) ? response.data.externalAddresses : [];
    if (internalAddresses.length === 0 && externalAddresses.length === 0) {
      const contentType = (response.headers as Record<string, string> | undefined)?.['content-type'] ?? 'unknown';
      const body = typeof response.data === 'string' ? (response.data as string).slice(0, 300) : JSON.stringify(response.data)?.slice(0, 300);
      log.warn(
        `[connection] tunnel/check returned no addresses — status=${response.status}, content-type=${contentType}, url=${proxyUrl}/tunnel/check, body(300):`,
        body,
      );
    }
    return { internalAddresses, externalAddresses };
  }

  async function refreshProxy(cloudApiBase: string, proxyRefreshToken: string, signal?: AbortSignal): Promise<ProxyMintResult> {
    const response = await httpClient.post<ProxyMintResponse>(
      `${cloudApiBase}/api/proxy/refresh`,
      {
        refresh_token: proxyRefreshToken,
      },
      { signal, withCredentials: true },
    );
    return extractProxyMint(response.data);
  }

  async function remintProxyFromL1(cloudApiBase: string, serverId: string, l1AccessToken: string, signal?: AbortSignal): Promise<ProxyMintResult> {
    const response = await httpClient.post<ProxyMintResponse>(`${cloudApiBase}/api/servers/${encodeURIComponent(serverId)}/select`, null, {
      headers: { Authorization: `Bearer ${l1AccessToken}` },
      signal,
    });
    return extractProxyMint(response.data);
  }

  return {
    loginDirect,
    verify2FA,
    refreshDirect,
    authCheck,
    logoutDirect,
    tunnelCheck,
    refreshProxy,
    remintProxyFromL1,
  };
}

function isTwoFactorPendingResponse(data: LoginRawResponse): data is TwoFactorPendingResponse {
  return typeof data === 'object' && data !== null && 'requires2fa' in data && data.requires2fa === true;
}

function extractTokens(data: JwtTokenResponse): Tokens {
  return {
    access: data.access_token,
    accessExpiresAt: data.access_token_expires_at,
    refresh: data.refresh_token,
    refreshExpiresAt: data.refresh_token_expires_at,
  };
}

function extractUser(data: LoginResponse): LoginResult['user'] {
  return {
    _id: data._id,
    username: data.username,
    email: data.email,
    role: data.role,
    firstLogin: data.firstLogin,
    avatar: data.avatar,
    language: data.language,
  };
}

function extractProxyMint(data: ProxyMintResponse): ProxyMintResult {
  if (!data || typeof data !== 'object' || !data.proxy_token || !data.proxy_url) {
    const shape = typeof data === 'string' ? `string:"${(data as string).slice(0, 120)}"` : JSON.stringify(data)?.slice(0, 200);
    throw new Error(`proxy mint response invalid — missing proxy_token/proxy_url (got ${shape})`);
  }
  return {
    proxyUrl: data.proxy_url,
    proxyToken: data.proxy_token,
    proxyRefreshToken: data.proxy_refresh_token,
    proxyTokenExpiresAt: data.proxy_token_expires_at,
    proxyRefreshTokenExpiresAt: data.proxy_refresh_token_expires_at,
  };
}
