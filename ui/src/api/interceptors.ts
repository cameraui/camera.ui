import { getBootResult } from '@/connection/bootApp.js';
import { bounceToCloudFrontend } from '@/connection/cloudHandoff.js';
import { isCapacitor } from '@/connection/runtime.js';

import { resolveAxiosClient } from './client.js';
import { isRemoteDisabledError, isServerGoneError, isTunnelPendingError, readErrorBody } from './errors.js';

import type { ProxyMintResult } from '@/connection/types.js';
import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

const MAX_TUNNEL_RETRIES = 3;
const DEFAULT_RETRY_AFTER_S = 5;

interface RetryConfig extends InternalAxiosRequestConfig {
  _proxyRetry?: boolean;
  _tunnelRetries?: number;
}

let remintInflight: Promise<string | null> | null = null;

function tryRemintProxy(): Promise<string | null> {
  if (remintInflight) return remintInflight;
  remintInflight = doRemintProxy().finally(() => {
    remintInflight = null;
  });
  return remintInflight;
}

async function doRemintProxy(): Promise<string | null> {
  const boot = getBootResult();
  if (boot.mode !== 'cloud' || !boot.cloudSession) return null;

  const session = boot.cloudSession.state.value;
  if (!session) return null;

  let minted: ProxyMintResult | null = null;
  if (session.proxyRefreshToken && session.cloudApiBase) {
    try {
      minted = await boot.api.refreshProxy(session.cloudApiBase, session.proxyRefreshToken);
    } catch {
      // fall through to L1 path
    }
  }

  if (!minted && isCapacitor && session.serverId && session.cloudApiBase) {
    try {
      const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
      const l1 = await SecureStorage.get('accessToken');
      if (typeof l1 === 'string') {
        minted = await boot.api.remintProxyFromL1(session.cloudApiBase, session.serverId, l1);
      }
    } catch {
      // fall through to null
    }
  }

  if (!minted) return null;

  boot.cloudSession.set({
    ...session,
    proxyUrl: minted.proxyUrl,
    proxyToken: minted.proxyToken,
    proxyRefreshToken: minted.proxyRefreshToken ?? session.proxyRefreshToken,
    proxyTokenExpiresAt: minted.proxyTokenExpiresAt,
    proxyRefreshTokenExpiresAt: minted.proxyRefreshTokenExpiresAt ?? session.proxyRefreshTokenExpiresAt,
  });

  // Push the fresh session into the kernel too. The transports' request
  // interceptors inject target.tokens.proxySession on EVERY request — with
  // only cloudSession updated, the retry (and every request after it) would
  // still carry the stale session and 401 again.
  const kernel = boot.connection.kernel;
  const phase = kernel.phase;
  const live = phase.kind === 'online' ? phase.target : phase.kind === 'reconnecting' ? phase.lastTarget : null;
  if (live) {
    kernel.dispatch({
      type: 'TOKENS_REFRESHED',
      tokens: {
        ...live.tokens,
        proxySession: minted.proxyToken,
        proxySessionExpiresAt: minted.proxyTokenExpiresAt,
        proxyRefresh: minted.proxyRefreshToken ?? live.tokens.proxyRefresh,
      },
    });
  }

  return minted.proxyToken;
}

export function installApiErrorHandling(): void {
  const client = resolveAxiosClient();

  client.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: AxiosError) => {
      const config = error.config as RetryConfig | undefined;

      // Proxy session expired (cloud mode): server returns 401 with a
      // `redirect` field. Re-mint via proxy RT or L1 AT, then retry once.
      const body = readErrorBody(error);
      const isProxySessionExpired = error.response?.status === 401 && body?.message === 'Session expired' && typeof body.redirect === 'string';
      if (isProxySessionExpired && config && !config._proxyRetry) {
        const fresh = await tryRemintProxy();
        if (fresh) {
          config._proxyRetry = true;
          if (config.headers) {
            (config.headers as Record<string, string>)['X-Proxy-Session'] = fresh;
          }
          return client(config);
        }
        return Promise.reject(error);
      }

      // Server registration deleted or revoked → cloud proxy returns 404.
      // Nothing actionable for the user on this page; hand control back to
      // the cloud frontend so they can re-pick.
      if (isServerGoneError(error)) {
        await bounceToCloudFrontend();
        return Promise.reject(error);
      }

      // Server owner toggled remote access off → 503 everywhere. Same UX
      // as server-gone — bounce instead of toasting on every parallel query.
      if (isRemoteDisabledError(error)) {
        await bounceToCloudFrontend();
        return Promise.reject(error);
      }

      // 'Tunnel unavailable'. Retry up to MAX_TUNNEL_RETRIES with the
      // server's Retry-After header.
      if (isTunnelPendingError(error) && config) {
        const attempts = config._tunnelRetries ?? 0;
        config._tunnelRetries = attempts + 1;
        if (attempts >= MAX_TUNNEL_RETRIES) return Promise.reject(error);

        const retryAfterHeader = error.response?.headers?.['retry-after'];
        const retryAfterS = Number.parseInt(retryAfterHeader ?? '', 10) || DEFAULT_RETRY_AFTER_S;
        await new Promise((resolve) => setTimeout(resolve, retryAfterS * 1000));
        return client(config);
      }

      return Promise.reject(error);
    },
  );
}
