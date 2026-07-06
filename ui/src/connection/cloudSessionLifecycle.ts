import axios from 'axios';

import { proxyRefreshLooksValid, proxyTokenLooksValid } from './cloudSession.js';

import type { Logger } from '@camera.ui/logger';
import type { AuthApi, CloudSessionHolder } from './types.js';

export interface CloudSessionLifecycleOptions {
  readonly api: AuthApi;
  readonly cloudSession: CloudSessionHolder;
  readonly readL1AccessToken?: () => Promise<string | null>;
  readonly onL1Unavailable?: () => Promise<void> | void;
  readonly logger?: Logger;
}

export interface CloudSessionLifecycle {
  ensureFresh(signal: AbortSignal): Promise<void>;
  wake(): void;
}

export function createCloudSessionLifecycle(options: CloudSessionLifecycleOptions): CloudSessionLifecycle {
  const { api, cloudSession, readL1AccessToken, onL1Unavailable, logger } = options;

  let inflight: Promise<void> | null = null;

  function ensureFresh(signal: AbortSignal): Promise<void> {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        await refresh(signal);
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  async function refresh(signal: AbortSignal): Promise<void> {
    const session = cloudSession.state.value;
    if (session && proxyTokenLooksValid(session)) return;

    if (session && proxyRefreshLooksValid(session) && session.cloudApiBase) {
      try {
        const refreshed = await api.refreshProxy(session.cloudApiBase, session.proxyRefreshToken!, signal);
        if (signal.aborted) return;
        cloudSession.set({
          ...session,
          proxyUrl: refreshed.proxyUrl ?? session.proxyUrl,
          proxyToken: refreshed.proxyToken,
          proxyRefreshToken: refreshed.proxyRefreshToken ?? session.proxyRefreshToken,
          proxyTokenExpiresAt: refreshed.proxyTokenExpiresAt,
          proxyRefreshTokenExpiresAt: refreshed.proxyRefreshTokenExpiresAt ?? session.proxyRefreshTokenExpiresAt,
        });
        logger?.debug('cloud-session', 'refresh OK via RT');
        return;
      } catch (err) {
        if (axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)) {
          logger?.warn('cloud-session', 'RT rejected — falling through to L1');
        } else {
          throw err;
        }
      }
    }

    if (!readL1AccessToken || !session?.serverId || !session.cloudApiBase) {
      await onL1Unavailable?.();
      throw new Error('cloud session expired and no L1 fallback available');
    }

    const l1Token = await readL1AccessToken();
    if (signal.aborted) return;
    if (!l1Token) {
      await onL1Unavailable?.();
      throw new Error('no L1 access token in secure storage');
    }

    const minted = await api.remintProxyFromL1(session.cloudApiBase, session.serverId, l1Token, signal);
    if (signal.aborted) return;
    cloudSession.set({
      ...session,
      proxyUrl: minted.proxyUrl ?? session.proxyUrl,
      proxyToken: minted.proxyToken,
      proxyRefreshToken: minted.proxyRefreshToken,
      proxyTokenExpiresAt: minted.proxyTokenExpiresAt,
      proxyRefreshTokenExpiresAt: minted.proxyRefreshTokenExpiresAt,
    });
    logger?.debug('cloud-session', 'refresh OK via L1 re-mint');
  }

  function wake(): void {
    const session = cloudSession.state.value;
    if (!session) return;
    if (proxyTokenLooksValid(session)) return;
    const ac = new AbortController();
    ensureFresh(ac.signal).catch(() => {
      // Proactive refresh failed; the reactive path (next discover / 401 retry)
      // will surface the error to the user. Don't propagate here.
    });
  }

  return { ensureFresh, wake };
}
