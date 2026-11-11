import { isLanCandidate } from './auth/api.js';

import type { Endpoint } from '@camera.ui/transport';

export type DirectRouteNote = 'home-only' | 'quick-tunnel';

export interface DirectServer {
  id: string;
  name: string;
  url: string;
  internalAddresses: readonly string[];
  externalAddresses: readonly string[];
  ca?: string;
  leafSha256?: string;
  routeNote?: DirectRouteNote;
}

const SERVERS_KEY = 'directServers';
const SELECTED_KEY = 'directServerId';

let current: DirectServer | null = null;

export function getDirectServer(): DirectServer | null {
  return current;
}

export async function loadSelectedDirectServer(): Promise<DirectServer | null> {
  const { Preferences } = await import('@capacitor/preferences');
  const [{ value: id }, servers] = await Promise.all([Preferences.get({ key: SELECTED_KEY }), readServers()]);
  current = servers.find((server) => server.id === id) ?? null;
  return current;
}

export async function updateDirectServer(patch: Partial<Omit<DirectServer, 'id' | 'url'>>): Promise<void> {
  if (!current) return;
  const updated = { ...current, ...patch };
  current = updated;
  const servers = await readServers();
  await writeServers(servers.map((server) => (server.id === updated.id ? updated : server)));
}

export async function forgetSelectedDirectServer(): Promise<void> {
  const { Preferences } = await import('@capacitor/preferences');
  await Preferences.remove({ key: SELECTED_KEY });
}

export function directServerPool(server: DirectServer): Endpoint[] {
  const urls = [...new Set([server.url, ...server.internalAddresses, ...server.externalAddresses])];
  return urls.map((url) => (isLanCandidate(url) ? { url, mode: 'direct-lan', priority: 0 } : { url, mode: 'direct-wan', priority: 1 }));
}

export function routeNoteFor(externalAddresses: readonly string[]): DirectRouteNote | undefined {
  if (externalAddresses.length === 0) return 'home-only';
  return externalAddresses.every(isQuickTunnel) ? 'quick-tunnel' : undefined;
}

function isQuickTunnel(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.trycloudflare.com');
  } catch {
    return false;
  }
}

async function readServers(): Promise<DirectServer[]> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: SERVERS_KEY });
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? (parsed as DirectServer[]) : [];
  } catch {
    return [];
  }
}

async function writeServers(servers: DirectServer[]): Promise<void> {
  const { Preferences } = await import('@capacitor/preferences');
  await Preferences.set({ key: SERVERS_KEY, value: JSON.stringify(servers) });
}
