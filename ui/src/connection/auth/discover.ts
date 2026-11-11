import axios from 'axios';

import { trustDirectServer, trustInternalCa } from '../certTrust.js';
import { directServerPool, getDirectServer } from '../directServer.js';
import { instanceOverride } from '../instance.js';
import { isCandidateUrl, isLanCandidate } from './api.js';

import type { Logger } from '@camera.ui/logger';
import type { Endpoint, StorageAdapter } from '@camera.ui/transport';
import type { CloudSessionLifecycle } from '../cloudSessionLifecycle.js';
import type { AuthApi, CloudSessionHolder, DiscoverFn, TunnelAddresses } from '../types.js';

const CACHED_POOL_TTL_MS = 24 * 60 * 60 * 1_000;
const CACHED_POOL_KEY = 'camera.ui:connection:discoverPool';
const CLOUD_LOOKUP_GRACE_MS = 3_000;

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

function screenPersistedPool(pool: readonly Endpoint[]): Endpoint[] {
  return pool
    .filter((endpoint) => isCandidateUrl(endpoint.url))
    .map((endpoint) => (endpoint.mode === 'direct-lan' && !isLanCandidate(endpoint.url) ? { ...endpoint, mode: 'direct-wan', priority: 1 } : endpoint));
}

interface PersistedPool {
  pool: Endpoint[];
  at: number;
  ca?: string;
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

export function createDiscoverDirectServer(): DiscoverFn {
  return async () => {
    const override = overridePool();
    if (override) return override;
    const server = getDirectServer();
    if (!server) return [];
    await trustDirectServer(server);
    return directServerPool(server);
  };
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
  let cachedCa: string | undefined;
  let hydrated = false;
  let remintedThisStreak = false;

  async function withTrust(pool: readonly Endpoint[], ca: string | undefined): Promise<readonly Endpoint[]> {
    await trustInternalCa(ca, pool);
    return pool;
  }

  async function ensureHydrated(): Promise<void> {
    if (hydrated) return;
    hydrated = true;
    if (!storage) return;
    try {
      const raw = await storage.get(poolKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedPool;
      const pool = parsed?.pool?.length ? screenPersistedPool(parsed.pool) : [];
      if (pool.length && Date.now() - parsed.at < CACHED_POOL_TTL_MS) {
        cachedPool = pool;
        cachedPoolAt = parsed.at;
        cachedCa = parsed.ca;
      }
    } catch {
      // corrupt/absent cache is non-fatal
    }
  }

  function hasCachedPool(): boolean {
    return cachedPool !== null && Date.now() - cachedPoolAt < CACHED_POOL_TTL_MS;
  }

  function takeCachedPool(reason: string): Promise<readonly Endpoint[]> | null {
    if (!cachedPool || !hasCachedPool()) return null;
    const pool = cachedPool;
    cachedPool = null;
    cachedPoolAt = 0;
    logger?.debug('discover', `${reason}, using cached pool fallback (${pool.length} endpoints, single-use)`);
    return withTrust(pool, cachedCa);
  }

  async function lookup(signal: AbortSignal): Promise<readonly Endpoint[]> {
    try {
      // a cloud outage blocks the proxy refresh, the cached pool still reaches the server
      await cloudSessionLifecycle.ensureFresh(signal);
      if (signal.aborted) return [];

      const session = cloudSession.state.value;
      if (!session) throw new Error('cloud session not initialised after ensureFresh');

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

      if (pool.length === 0) return takeCachedPool('empty pool') ?? pool;

      remintedThisStreak = false;
      cachedPool = pool;
      cachedPoolAt = Date.now();
      cachedCa = addresses.ca;
      storage?.set(poolKey, JSON.stringify({ pool, at: cachedPoolAt, ca: cachedCa } satisfies PersistedPool));
      return withTrust(pool, addresses.ca);
    } catch (err) {
      if (signal.aborted) throw err;
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;

      if (status === 401 || status === 403) {
        cloudSession.patch({ proxyTokenExpiresAt: Date.now() - 1 });
        cachedPool = null;
        cachedPoolAt = 0;
        storage?.del(poolKey);
        throw err;
      }

      const fallback = takeCachedPool(`cloud lookup failed (${stringifyDiscoverError(err)})`);
      if (fallback) return fallback;
      throw err;
    }
  }

  return async (signal: AbortSignal): Promise<readonly Endpoint[]> => {
    const override = overridePool();
    if (override) return override;

    await ensureHydrated();
    const result = lookup(signal);
    if (!hasCachedPool()) return result;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const grace = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), CLOUD_LOOKUP_GRACE_MS);
    });
    try {
      const pool = await Promise.race([result, grace]);
      if (pool) return pool;
    } finally {
      clearTimeout(timer);
    }
    result.catch(() => {});
    return takeCachedPool('cloud lookup is slow') ?? result;
  };
}
