import { makeProbeFailure } from '@camera.ui/transport';

import { createNetworkAdapters } from '../adapters/network.js';
import { createStorageAdapter } from '../adapters/storage.js';
import { createVisibilitySource } from '../adapters/visibility.js';
import { createDiscoverDirect } from '../auth/discover.js';

import type { Logger } from '@camera.ui/logger';
import type { ConnectionTarget, Endpoint, Tokens } from '@camera.ui/transport';
import type { ConnectionOptions } from '../types.js';

export interface HaHost {
  readonly auth: {
    readonly data: { readonly access_token: string };
    readonly expired: boolean;
    refreshAccessToken(): Promise<void>;
  };
  fetchWithAuth(path: string, init?: RequestInit): Promise<Response>;
  callWS<T>(message: Record<string, unknown>): Promise<T>;
}

const TOKEN_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const SIGN_EXPIRES_S = 2 * 60 * 60;
const SIGN_EXPIRES_STREAM_S = 5 * 60;
const RESOLVE_REFRESH_MS = 20 * 60_000;

export function haProxyPath(entryId: string): string {
  return `/api/cameraui/auth/${entryId}`;
}

export function haTarget(entryId: string): ConnectionTarget {
  const endpoint: Endpoint = { url: `${window.location.origin}${haProxyPath(entryId)}`, mode: 'direct-lan', priority: 0 };
  const tokens: Tokens = { access: 'ha', accessExpiresAt: Date.now() + TOKEN_TTL_MS };
  return { endpoint, tokens };
}

async function signPath(host: HaHost, path: string, expires: number): Promise<string> {
  const signed = await host.callWS<{ path: string }>({ type: 'auth/sign_path', path, expires });
  return signed.path;
}

function wsOrigin(url: URL): string {
  return `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`;
}

export function buildHaMode(host: HaHost, entryId: string, logger?: Logger): ConnectionOptions {
  const network = createNetworkAdapters();
  const proxyPath = haProxyPath(entryId);

  return {
    adapters: {
      storage: createStorageAdapter(),
      visibilitySource: createVisibilitySource(),
      networkSource: network.networkSource,
      networkChangeSource: network.networkChangeSource,
    },
    callbacks: {
      discover: createDiscoverDirect(`${window.location.origin}${proxyPath}`),
      probe: async (ctx) => {
        let res: Response;
        try {
          res = await host.fetchWithAuth(`${proxyPath}/api/auth/check`, { signal: ctx.signal });
        } catch (err) {
          if (ctx.signal.aborted) throw makeProbeFailure('aborted', 'probe aborted');
          throw makeProbeFailure('transient', err instanceof Error ? err.message : 'auth/check failed');
        }
        if (res.ok) return ctx.lastTokens ?? haTarget(entryId).tokens;
        if (res.status === 401 || res.status === 403) throw makeProbeFailure('needs-auth', 'card access denied');
        throw makeProbeFailure('transient', `auth/check ${res.status}`);
      },
      refresh: async (target) => target.tokens,
    },
    logger,
    storageNamespace: `ha-cards:${entryId}`,
    transportOptions: {
      http: {
        authorize: async (config) => {
          if (host.auth.expired) await host.auth.refreshAccessToken();
          config.headers.set('Authorization', `Bearer ${host.auth.data.access_token}`);
        },
      },
      nats: {
        resolveServers: async ({ target, connId }) => {
          const base = new URL(target.endpoint.url);
          const path = await signPath(host, `${base.pathname}/api/proxy?connId=${encodeURIComponent(connId)}`, SIGN_EXPIRES_S);
          return [`${wsOrigin(base)}${path}`];
        },
        resolveRefreshMs: RESOLVE_REFRESH_MS,
      },
      ws: {
        resolveUrl: async ({ target, spec }) => {
          const base = new URL(target.endpoint.url);
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(spec.query ?? {})) {
            if (value) params.set(key, value);
          }
          const qs = params.toString();
          const path = await signPath(host, `${base.pathname}${spec.path}${qs ? `?${qs}` : ''}`, SIGN_EXPIRES_STREAM_S);
          return `${wsOrigin(base)}${path}`;
        },
      },
      socketio: {
        // HA validates the exact query list: engine.io appends EIO/transport after opts.query and socket.io
        // requests the path with a trailing slash, so sign precisely that shape
        resolveQuery: async ({ target, path, query }) => {
          const base = new URL(target.endpoint.url);
          const params = new URLSearchParams({ ...query, EIO: '4', transport: 'websocket' });
          const signed = await signPath(host, `${path}/?${params.toString()}`, SIGN_EXPIRES_S);
          const authSig = new URL(signed, base.origin).searchParams.get('authSig') ?? '';
          return { ...query, authSig };
        },
        resolveRefreshMs: RESOLVE_REFRESH_MS,
      },
    },
  };
}
