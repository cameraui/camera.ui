import type { Tokens } from '@camera.ui/transport';
import type { AuthApi, RefreshCoordination, RefreshFn } from '../types.js';

const REUSE_GRACE_MS = 15_000;

export interface RefreshInput {
  readonly endpoint: string;
  readonly refreshToken: string | undefined;
  readonly base?: Tokens;
  readonly signal?: AbortSignal;
}

export interface RefreshCoordinator {
  readonly refresh: RefreshFn;
  readonly getFreshTokens: (input: RefreshInput) => Promise<Tokens>;
  readonly bindCoordination: (co: RefreshCoordination) => void;
  readonly clear: () => void;
}

export function createRefresh(api: AuthApi): RefreshCoordinator {
  let inflight: Promise<Tokens> | null = null;
  let cached: Tokens | null = null;
  let cachedEndpoint = '';
  let coordination: RefreshCoordination | null = null;

  function stillFresh(tokens: Tokens): boolean {
    return !!tokens.accessExpiresAt && tokens.accessExpiresAt > Date.now() + REUSE_GRACE_MS;
  }

  function invalidateIfRejected(rejectedAccess: string | undefined): void {
    if (rejectedAccess && cached?.access === rejectedAccess) {
      cached = null;
    }
  }

  async function doRefresh(endpoint: string, refreshToken: string | undefined, base: Tokens | undefined, signal?: AbortSignal): Promise<Tokens> {
    if (cachedEndpoint === endpoint && cached && stillFresh(cached)) return cached;
    if (inflight) return inflight;

    // Inside the cross-tab lock (when wired): another tab may have rotated
    // the refresh token while we waited — refreshing with the stale one gets
    // rejected server-side (hard rotation) and forces a logout.
    const latest: Tokens | null = coordination?.getLatestTokens?.() ?? null;
    if (latest && stillFresh(latest)) {
      cached = latest;
      cachedEndpoint = endpoint;
      return latest;
    }
    const effectiveRefresh = latest?.refresh ?? refreshToken;
    if (!effectiveRefresh) throw new Error('no refresh token available');

    inflight = (async () => {
      const result = await api.refreshDirect(endpoint, effectiveRefresh, signal);
      const merged: Tokens = { ...base, ...result.tokens };
      cached = merged;
      cachedEndpoint = endpoint;
      return merged;
    })();
    try {
      return await inflight;
    } finally {
      inflight = null;
    }
  }

  async function coalesced(endpoint: string, refreshToken: string | undefined, base: Tokens | undefined, signal?: AbortSignal): Promise<Tokens> {
    // Cheap pre-checks outside the lock; the authoritative ones repeat inside.
    if (cachedEndpoint === endpoint && cached && stillFresh(cached)) return cached;
    if (inflight) return inflight;
    const lock = coordination?.acquireLock;
    if (lock) return lock(() => doRefresh(endpoint, refreshToken, base, signal));
    return doRefresh(endpoint, refreshToken, base, signal);
  }

  return {
    refresh: (target, reason) => {
      if (reason === 'auth-error') invalidateIfRejected(target.tokens.access);
      // No lock here: tokenLifecycle already holds the same navigator.locks
      // key around this call and the lock is not reentrant.
      return doRefresh(target.endpoint.url, target.tokens.refresh, target.tokens);
    },
    getFreshTokens: ({ endpoint, refreshToken, base, signal }) => {
      // The probe path lands here after a 401 — the access token it holds
      // was just rejected.
      invalidateIfRejected(base?.access);
      return coalesced(endpoint, refreshToken, base, signal);
    },
    bindCoordination: (co) => {
      coordination = co;
    },
    clear: () => {
      cached = null;
      cachedEndpoint = '';
      inflight = null;
    },
  };
}
