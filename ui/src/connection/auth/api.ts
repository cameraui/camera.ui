import { localAccessExpiry } from '@camera.ui/transport';
import axios from 'axios';

import { bearer } from '../fetchAuth.js';
import { installNativeHttp } from '../nativeHttp.js';

import type { JwtTokenResponse, SessionResponse, TwoFactorPendingResponse } from '@shared/types';
import type { AuthApi, LoginCredentials, LoginOutcome, LoginResult, ProxyMintResult, Tokens, TunnelAddresses } from '../types.js';

const log = useLogger('AuthApi');

interface LoginResponse extends JwtTokenResponse {
  username?: string;
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
const LOCAL_SUFFIXES = ['.local', '.lan', '.home', '.home.arpa', '.internal', '.localdomain', '.fritz.box'];
const IPV4_LITERAL = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const UNIQUE_LOCAL_IPV6 = /^f[cd][0-9a-f]{2}:/;

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
      headers: bearer(accessToken),
      signal,
    });
  }

  async function logoutDirect(endpoint: string, accessToken: string): Promise<void> {
    await httpClient.post(`${endpoint}/api/auth/logout`, null, {
      headers: bearer(accessToken),
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
    const { internalAddresses, externalAddresses } = screenTunnelAddresses(response.data.internalAddresses, response.data.externalAddresses);
    if (internalAddresses.length === 0 && externalAddresses.length === 0) {
      const contentType = (response.headers as Record<string, string> | undefined)?.['content-type'] ?? 'unknown';
      const body = typeof response.data === 'string' ? (response.data as string).slice(0, 300) : JSON.stringify(response.data)?.slice(0, 300);
      log.warn(
        `[connection] tunnel/check returned no addresses — status=${response.status}, content-type=${contentType}, url=${proxyUrl}/tunnel/check, body(300):`,
        body,
      );
    }
    const ca = typeof response.data.ca === 'string' && response.data.ca.includes('BEGIN CERTIFICATE') ? response.data.ca : undefined;
    return { internalAddresses, externalAddresses, ca };
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

export function screenTunnelAddresses(internal: unknown, external: unknown): Pick<TunnelAddresses, 'internalAddresses' | 'externalAddresses'> {
  const internalAddresses: string[] = [];
  const demoted: string[] = [];
  for (const url of stringsOf(internal)) {
    const host = candidateHostOf(url);
    if (host === null) continue;
    (isLanHost(host) ? internalAddresses : demoted).push(url);
  }
  const externals = stringsOf(external).filter(isCandidateUrl);
  const externalAddresses = [...new Set([...externals, ...demoted])];
  return { internalAddresses, externalAddresses };
}

export function isCandidateUrl(url: string): boolean {
  return candidateHostOf(url) !== null;
}

export function isLanCandidate(url: string): boolean {
  const host = candidateHostOf(url);
  return host !== null && isLanHost(host);
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function candidateHostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return isLoopbackHost(parsed.hostname) ? null : parsed.hostname;
  } catch {
    return null;
  }
}

function ipv4Prefix(host: string): [number, number] | null {
  const octets = IPV4_LITERAL.exec(host);
  return octets ? [Number(octets[1]), Number(octets[2])] : null;
}

function isLoopbackHost(host: string): boolean {
  const name = host.endsWith('.') ? host.slice(0, -1) : host;
  if (name === 'localhost' || name.endsWith('.localhost')) return true;
  if (host === '[::1]' || host === '[::]' || host.startsWith('[::ffff:7f')) return true;
  const prefix = ipv4Prefix(host);
  return prefix !== null && (prefix[0] === 127 || prefix[0] === 0);
}

function isLanHost(host: string): boolean {
  if (host.startsWith('[')) return UNIQUE_LOCAL_IPV6.test(host.slice(1, -1));
  const prefix = ipv4Prefix(host);
  if (prefix) {
    const [a, b] = prefix;
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (host.endsWith('.')) return false;
  return !host.includes('.') || LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function isTwoFactorPendingResponse(data: LoginRawResponse): data is TwoFactorPendingResponse {
  return typeof data === 'object' && data !== null && 'requires2fa' in data && data.requires2fa === true;
}

function extractTokens(data: JwtTokenResponse): Tokens {
  return {
    access: data.access_token,
    accessExpiresAt: localAccessExpiry(data.access_token, data.access_token_expires_at),
    refresh: data.refresh_token,
    refreshExpiresAt: data.refresh_token_expires_at,
  };
}

function extractUser(data: LoginResponse): LoginResult['user'] {
  return {
    _id: data._id,
    username: data.username,
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
    proxyTokenExpiresAt: localAccessExpiry(data.proxy_token, data.proxy_token_expires_at),
    proxyRefreshTokenExpiresAt: data.proxy_refresh_token_expires_at,
  };
}
