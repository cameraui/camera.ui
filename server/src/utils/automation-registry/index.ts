import { TTLCache } from '@isaacs/ttlcache';

export interface AutomationCatalogEntry {
  title: string;
  description?: string;
  category?: string;
  author?: string;
  featured?: boolean;
  tags?: string[];
  requiredPlugins?: string[];
  requiredInputs?: { type: string; count?: number }[];
  blueprint: string;
}

const BASE_URL = 'https://raw.githubusercontent.com/cameraui/automations/main/';

const CATALOG_TTL_MS = 60 * 60 * 1000;
const BLUEPRINT_TTL_MS = 60 * 60 * 1000;

const catalogCache = new TTLCache<string, unknown>({ max: 8, ttl: CATALOG_TTL_MS });
const blueprintCache = new TTLCache<string, unknown>({ max: 100, ttl: BLUEPRINT_TTL_MS });

let lastGoodCatalog: Record<string, AutomationCatalogEntry> = {};

export function invalidateAutomationRegistry(): void {
  catalogCache.clear();
  blueprintCache.clear();
}

async function fetchJson<T>(url: string): Promise<T | undefined> {
  const response = await fetch(url);
  if (!response.ok) {
    return undefined;
  }
  return (await response.json()) as T;
}

export async function getAutomationCatalog(): Promise<Record<string, AutomationCatalogEntry>> {
  const cached = catalogCache.get('catalog') as Record<string, AutomationCatalogEntry> | undefined;
  if (cached) {
    return cached;
  }

  try {
    const data = await fetchJson<Record<string, AutomationCatalogEntry>>(`${BASE_URL}catalog.json`);
    if (data) {
      lastGoodCatalog = data;
      catalogCache.set('catalog', data, { ttl: CATALOG_TTL_MS });
      return data;
    }
  } catch {
    // fail-open: fall through to last-good
  }

  return lastGoodCatalog;
}

export async function getAutomationBlueprint(file: string): Promise<unknown | undefined> {
  // guard against path traversal: only a bare basename is allowed, never a nested path
  if (!file || file.includes('/') || file.includes('..')) {
    return undefined;
  }

  const cached = blueprintCache.get(file);
  if (cached) {
    return cached;
  }

  try {
    const data = await fetchJson<unknown>(`${BASE_URL}blueprints/${file}`);
    if (data) {
      blueprintCache.set(file, data, { ttl: BLUEPRINT_TTL_MS });
      return data;
    }
  } catch {
    // fail-open: undefined signals unreachable / missing blueprint
  }

  return undefined;
}
