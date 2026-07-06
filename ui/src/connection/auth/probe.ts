import { isProbeFailure, makeProbeFailure } from '@camera.ui/transport';
import axios from 'axios';

import { isCancellationError } from '@/common/utils.js';

import type { ProbeContext, Tokens } from '@camera.ui/transport';
import type { AuthApi, ProbeFn } from '../types.js';
import type { RefreshCoordinator } from './refresh.js';

export function createProbe(api: AuthApi, refresh: RefreshCoordinator): ProbeFn {
  return async (ctx: ProbeContext): Promise<Tokens> => {
    const endpoint = ctx.endpoint.url;
    const accessToken = ctx.lastTokens?.access ?? '';

    try {
      await api.authCheck(endpoint, accessToken, ctx.signal);
      // 200 without tokens shouldn't happen — auth/check requires Bearer.
      // If it does, treat as needs-auth so the UI drives a fresh login.
      if (!ctx.lastTokens?.access) throw makeProbeFailure('needs-auth', 'no tokens');
      return ctx.lastTokens;
    } catch (err) {
      // Own classifications from the try block (e.g. the 200-without-tokens
      // needs-auth) must pass through untouched — the fallback below would
      // relabel them as transient and trap the tab in the offline backoff
      // loop instead of showing the login page.
      if (isProbeFailure(err)) throw err;
      if (ctx.signal.aborted) throw err;
      if (isCancellationError(err)) throw makeProbeFailure('aborted', 'request canceled');
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;

      // No tokens path: we hit the server purely to confirm reachability +
      // surface the fastest-responding endpoint to the probeLoop race. Any
      // HTTP response (server's 401 "Unauthorized" for the empty Bearer) =
      // reachable → needs-auth. Network failures stay transient so the
      // dead endpoints lose the race.
      if (!ctx.lastTokens?.access) {
        if (typeof status === 'number') throw makeProbeFailure('needs-auth', 'no tokens');
        throw makeProbeFailure('transient', err instanceof Error ? err.message : 'auth/check failed');
      }

      if (status === 401 && ctx.lastTokens.refresh) {
        try {
          const freshTokens = await refresh.getFreshTokens({ endpoint, refreshToken: ctx.lastTokens.refresh, base: ctx.lastTokens, signal: ctx.signal });
          return { ...ctx.lastTokens, ...freshTokens };
        } catch (refreshErr) {
          if (ctx.signal.aborted) throw refreshErr;
          if (isCancellationError(refreshErr)) throw makeProbeFailure('aborted', 'refresh canceled');
          const refreshStatus = axios.isAxiosError(refreshErr) ? refreshErr.response?.status : undefined;
          if (refreshStatus === 401 || refreshStatus === 403) {
            throw makeProbeFailure('needs-auth', 'refresh rejected');
          }
          throw makeProbeFailure('transient', refreshErr instanceof Error ? refreshErr.message : 'refresh failed');
        }
      }

      if (status === 401 || status === 403) {
        throw makeProbeFailure('needs-auth', 'tokens expired');
      }
      throw makeProbeFailure('transient', err instanceof Error ? err.message : 'auth/check failed');
    }
  };
}
