import { TTLCache } from '@isaacs/ttlcache';
import { satisfies } from 'semver';

export interface CatalogEntry {
  displayName?: string;
  category?: string;
  featured?: boolean;
  tagline?: string;
  logo?: string;
  screenshots?: string[];
}

export interface VerifiedEntry {
  range: string;
  note?: string;
}

export interface BlocklistEntry {
  range: string;
  reason: string;
  ref?: string;
}

const BASE_URL = 'https://raw.githubusercontent.com/cameraui/plugins/main/';
const DOWNLOADS_URL = 'https://api.npmjs.org/downloads/point/last-week/';

const CATALOG_TTL_MS = 60 * 60 * 1000;
const VERIFIED_TTL_MS = 60 * 60 * 1000;
const BLOCKLIST_TTL_MS = 15 * 60 * 1000;
const DOWNLOADS_TTL_MS = 6 * 60 * 60 * 1000;

const listCache = new TTLCache<string, unknown>({ max: 8, ttl: CATALOG_TTL_MS });
const downloadsCache = new TTLCache<string, number>({ max: 500, ttl: DOWNLOADS_TTL_MS });

let lastGoodCatalog: Record<string, CatalogEntry> = {};
let lastGoodVerified: Record<string, VerifiedEntry> = {};
let lastGoodBlocklist: Record<string, BlocklistEntry> = {};

export function invalidateRegistry(): void {
  listCache.clear();
  downloadsCache.clear();
}

async function fetchJson<T>(url: string): Promise<T | undefined> {
  const response = await fetch(url);
  if (!response.ok) {
    return undefined;
  }
  return (await response.json()) as T;
}

export async function getCatalog(): Promise<Record<string, CatalogEntry>> {
  const cached = listCache.get('catalog') as Record<string, CatalogEntry> | undefined;
  if (cached) {
    return cached;
  }

  try {
    const data = await fetchJson<Record<string, CatalogEntry>>(`${BASE_URL}catalog.json`);
    if (data) {
      lastGoodCatalog = data;
      listCache.set('catalog', data, { ttl: CATALOG_TTL_MS });
      return data;
    }
  } catch {
    // fail-open: fall through to last-good
  }

  return lastGoodCatalog;
}

export async function getVerified(): Promise<Record<string, VerifiedEntry>> {
  const cached = listCache.get('verified') as Record<string, VerifiedEntry> | undefined;
  if (cached) {
    return cached;
  }

  try {
    const data = await fetchJson<{ plugins?: Record<string, VerifiedEntry> }>(`${BASE_URL}verified.json`);
    if (data) {
      const plugins = data.plugins ?? {};
      lastGoodVerified = plugins;
      listCache.set('verified', plugins, { ttl: VERIFIED_TTL_MS });
      return plugins;
    }
  } catch {
    // fail-open: fall through to last-good
  }

  return lastGoodVerified;
}

export async function getBlocklist(): Promise<Record<string, BlocklistEntry>> {
  const cached = listCache.get('blocklist') as Record<string, BlocklistEntry> | undefined;
  if (cached) {
    return cached;
  }

  try {
    const data = await fetchJson<{ plugins?: Record<string, BlocklistEntry> }>(`${BASE_URL}blocklist.json`);
    if (data) {
      const plugins = data.plugins ?? {};
      lastGoodBlocklist = plugins;
      listCache.set('blocklist', plugins, { ttl: BLOCKLIST_TTL_MS });
      return plugins;
    }
  } catch {
    // fail-open: fall through to last-good
  }

  return lastGoodBlocklist;
}

export function computeTrust(name: string, verified: Record<string, VerifiedEntry>, version?: string): 'official' | 'verified' | 'community' {
  if (name.startsWith('@camera.ui/')) {
    return 'official';
  }

  const entry = verified[name];
  if (entry && (entry.range === '*' || !version || satisfies(version, entry.range))) {
    return 'verified';
  }

  return 'community';
}

export function getBlock(name: string, version: string | undefined, blocklist: Record<string, BlocklistEntry>): { reason: string; ref?: string } | undefined {
  const entry = blocklist[name];
  if (!entry) {
    return undefined;
  }

  if (entry.range === '*' || (version && satisfies(version, entry.range))) {
    return { reason: entry.reason, ref: entry.ref };
  }

  return undefined;
}

export async function getWeeklyDownloads(names: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const toFetch: string[] = [];

  for (const name of names) {
    const cached = downloadsCache.get(name);
    if (cached !== undefined) {
      result[name] = cached;
    } else {
      toFetch.push(name);
    }
  }

  await Promise.allSettled(
    toFetch.map(async (name) => {
      try {
        const data = await fetchJson<{ downloads?: number }>(`${DOWNLOADS_URL}${name}`);
        if (data && typeof data.downloads === 'number') {
          downloadsCache.set(name, data.downloads);
          result[name] = data.downloads;
        }
      } catch {
        // best-effort: omit downloads for this name
      }
    }),
  );

  return result;
}
