import axios from 'axios';

import { instanceOverride } from '../instance.js';

import type { Logger } from '@camera.ui/logger';
import type { Endpoint, StorageAdapter } from '@camera.ui/transport';
import type { CloudSessionLifecycle } from '../cloudSessionLifecycle.js';
import type { AuthApi, CloudSessionHolder, DiscoverFn, TunnelAddresses } from '../types.js';

const CACHED_POOL_TTL_MS = 24 * 60 * 60 * 1_000;
const CACHED_POOL_KEY = 'camera.ui:connection:discoverPool';

function buildPool(addresses: TunnelAddresses): Endpoint[] {
  const pool: Endpoint[] = [];
  for (const url of addresses.internalAddresses) {
    pool.push({ url, mode: 'direct-lan', priority: 0 });
  }
  for (const url of addresses.externalAddresses) {
    pool.push({ url, mode: 'direct-wan', priority: 1 });
  }
  return pool;
}

interface PersistedPool {
  pool: Endpoint[];
  at: number;
}

function overridePool(): Endpoint[] | null {
  const url = instanceOverride.value;
  if (!url) return null;
  return [{ url, mode: 'direct-lan', priority: 0 }];
}

function stringifyDiscoverError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.code === 'ECONNABORTED') return 'timeout';
    if (err.code) return err.code;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'unknown';
}

export function createDiscoverDirect(endpointUrl: string): DiscoverFn {
  const defaultPool: Endpoint[] = [{ url: endpointUrl, mode: 'direct-lan', priority: 0 }];
  return async () => overridePool() ?? defaultPool;
}

export interface DiscoverCloudOptions {
  readonly api: AuthApi;
  readonly cloudSession: CloudSessionHolder;
  readonly cloudSessionLifecycle: CloudSessionLifecycle;
  readonly storage?: StorageAdapter;
  readonly serverId?: string;
  readonly logger?: Logger;
}

export function createDiscoverCloud(options: DiscoverCloudOptions): DiscoverFn {
  const { api, cloudSession, cloudSessionLifecycle, storage, serverId, logger } = options;
  const poolKey = serverId ? `${CACHED_POOL_KEY}:${serverId}` : CACHED_POOL_KEY;

  let cachedPool: Endpoint[] | null = null;
  let cachedPoolAt = 0;
  let hydrated = false;
  let remintedThisStreak = false;

  async function ensureHydrated(): Promise<void> {
    if (hydrated) return;
    hydrated = true;
    if (!storage) return;
    try {
      const raw = await storage.get(poolKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedPool;
      if (parsed?.pool?.length && Date.now() - parsed.at < CACHED_POOL_TTL_MS) {
        cachedPool = parsed.pool;
        cachedPoolAt = parsed.at;
      }
    } catch {
      // corrupt/absent cache is non-fatal
    }
  }

  return async (signal: AbortSignal): Promise<readonly Endpoint[]> => {
    const override = overridePool();
    if (override) return override;

    await ensureHydrated();
    await cloudSessionLifecycle.ensureFresh(signal);
    if (signal.aborted) return [];

    const session = cloudSession.state.value;
    if (!session) throw new Error('cloud session not initialised after ensureFresh');

    try {
      let addresses = await api.tunnelCheck(session.proxyUrl, session.proxyToken, signal);
      let pool = buildPool(addresses);

      if (pool.length === 0 && !remintedThisStreak) {
        remintedThisStreak = true;
        const counts = `internal=${addresses.internalAddresses.length}, external=${addresses.externalAddresses.length}`;
        logger?.debug('discover', `tunnel/check empty pool (proxyUrl=${session.proxyUrl}, ${counts}) — forcing session re-mint`);
        cloudSession.patch({ proxyTokenExpiresAt: Date.now() - 1 });
        await cloudSessionLifecycle.ensureFresh(signal);
        if (signal.aborted) return [];
        const fresh = cloudSession.state.value;
        if (fresh && fresh.proxyToken !== session.proxyToken) {
          logger?.debug('discover', `re-minted session, retrying tunnel/check (proxyUrl=${fresh.proxyUrl})`);
          addresses = await api.tunnelCheck(fresh.proxyUrl, fresh.proxyToken, signal);
          pool = buildPool(addresses);
        }
      }

      if (pool.length === 0) {
        if (cachedPool && Date.now() - cachedPoolAt < CACHED_POOL_TTL_MS) {
          const fallback = cachedPool;
          cachedPool = null;
          cachedPoolAt = 0;
          logger?.debug('discover', `empty pool — using cached pool fallback (${fallback.length} endpoints, single-use)`);
          return fallback;
        }
        return pool;
      }

      remintedThisStreak = false;
      cachedPool = pool;
      cachedPoolAt = Date.now();
      storage?.set(poolKey, JSON.stringify({ pool, at: cachedPoolAt } satisfies PersistedPool));
      return pool;
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;

      if (status === 401 || status === 403) {
        cloudSession.patch({ proxyTokenExpiresAt: Date.now() - 1 });
        cachedPool = null;
        cachedPoolAt = 0;
        storage?.del(poolKey);
        throw err;
      }

      if (cachedPool && Date.now() - cachedPoolAt < CACHED_POOL_TTL_MS) {
        const pool = cachedPool;
        cachedPool = null;
        cachedPoolAt = 0;
        logger?.debug('discover', `tunnel/check failed (${stringifyDiscoverError(err)}) — using cached pool fallback (${pool.length} endpoints, single-use)`);
        return pool;
      }
      throw err;
    }
  };
}
