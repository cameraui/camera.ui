import { addressList, listsLoopback, trustEntry } from '../../utils/trusted-addresses.js';

export interface ProxyAuthSettings {
  port: number;
  header: string;
  trust: string[];
  secret?: string;
  logoutUrl?: string;
}

export const PROXY_AUTH_ENVIRONMENT = {
  port: 'CAMERA_UI_PROXY_AUTH_PORT',
  header: 'CAMERA_UI_PROXY_AUTH_HEADER',
  trust: 'CAMERA_UI_PROXY_AUTH_TRUST',
  secret: 'CAMERA_UI_PROXY_AUTH_SECRET',
  logoutUrl: 'CAMERA_UI_PROXY_AUTH_LOGOUT_URL',
} as const;

export const DEFAULT_PROXY_AUTH_HEADER = 'remote-user';
export const MIN_PROXY_AUTH_SECRET_LENGTH = 16;
const HEADER_TOKEN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
const RESERVED_HEADERS = new Set(['authorization', 'cookie', 'host', 'x-forwarded-for', 'x-proxy-secret']);

export function resolveProxyAuth(file: unknown, env: NodeJS.ProcessEnv, ports: (number | undefined)[], warn: (message: string) => void): ProxyAuthSettings | undefined {
  const block = file && typeof file === 'object' && !Array.isArray(file) ? (file as Record<string, unknown>) : {};
  const value = (key: keyof typeof PROXY_AUTH_ENVIRONMENT): unknown => (env[PROXY_AUTH_ENVIRONMENT[key]]?.trim() ? env[PROXY_AUTH_ENVIRONMENT[key]] : block[key]);

  const rawPort = value('port');
  if (rawPort === undefined || rawPort === null || rawPort === '') return undefined;

  const port = typeof rawPort === 'number' ? rawPort : typeof rawPort === 'string' && /^\d+$/.test(rawPort.trim()) ? +rawPort : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    warn(`Proxy sign-in is off: ${JSON.stringify(rawPort)} is not a port`);
    return undefined;
  }
  if (ports.includes(port)) {
    warn(`Proxy sign-in is off: port ${port} is already taken by camera.ui`);
    return undefined;
  }

  const rawHeader = value('header');
  const header = typeof rawHeader === 'string' && rawHeader.trim() ? rawHeader.trim().toLowerCase() : DEFAULT_PROXY_AUTH_HEADER;
  if (!isProxyAuthHeader(header)) {
    warn(`Proxy sign-in is off: ${JSON.stringify(rawHeader)} can not carry the user name`);
    return undefined;
  }

  const rawTrust = value('trust');
  const entries = typeof rawTrust === 'string' ? rawTrust.split(',') : Array.isArray(rawTrust) ? rawTrust : rawTrust === undefined || rawTrust === null ? [] : [rawTrust];
  const trust: string[] = [];
  for (const raw of entries) {
    if (typeof raw === 'string' && !raw.trim()) continue;
    const entry = trustEntry(raw);
    if (entry) trust.push(entry);
    else warn(`Proxy sign-in ignores the trusted address ${JSON.stringify(raw)}, it is not an IP address or CIDR range`);
  }

  const rawSecret = value('secret');
  const secret = typeof rawSecret === 'string' ? rawSecret.trim() : typeof rawSecret === 'number' ? `${rawSecret}` : '';
  if ((secret && secret.length < MIN_PROXY_AUTH_SECRET_LENGTH) || (!secret && rawSecret !== undefined && rawSecret !== null && rawSecret !== '')) {
    warn(`Proxy sign-in is off: the secret needs at least ${MIN_PROXY_AUTH_SECRET_LENGTH} characters`);
    return undefined;
  }

  if (trust.length === 0 && !secret) {
    warn('Proxy sign-in is off: it needs the address of the proxy or a secret');
    return undefined;
  }
  if (listsLoopback(addressList(trust))) {
    warn('Proxy sign-in trusts loopback: every process on this machine, plugins included, can sign in as any user. Set a secret as well');
  }

  return { port, header, trust, secret: secret || undefined, logoutUrl: logoutUrl(value('logoutUrl'), warn) };
}

export function isProxyAuthHeader(header: string): boolean {
  return HEADER_TOKEN.test(header) && !RESERVED_HEADERS.has(header) && !header.startsWith('x-cui-');
}

function logoutUrl(raw: unknown, warn: (message: string) => void): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const text = typeof raw === 'string' ? raw.trim() : '';
  const url = URL.canParse(text) ? new URL(text) : undefined;
  if (url && (url.protocol === 'http:' || url.protocol === 'https:')) return url.href;
  warn(`Proxy sign-in ignores the logout URL ${JSON.stringify(raw)}, it is not an http(s) address`);
  return undefined;
}
