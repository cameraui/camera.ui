import { AUTH_SERVICE_URL, BILLING_SERVICE_URL, CLOUD_SERVICE_URL } from '../../services/config/constants.js';

import type { CloudCredentialStore } from './credentialStore.js';

export type FetchTarget = 'auth' | 'cloud' | 'billing';

const HOSTS: Record<FetchTarget, string> = {
  auth: AUTH_SERVICE_URL,
  cloud: CLOUD_SERVICE_URL,
  billing: BILLING_SERVICE_URL,
};

export interface CloudFetchOptions {
  target: FetchTarget;
  credentialStore?: CloudCredentialStore;
  requiredScopes?: string[];
}

export function cloudFetch(opts: CloudFetchOptions): (path: string, init?: RequestInit) => Promise<Response> {
  const baseURL = HOSTS[opts.target];

  const send = async (path: string, init: RequestInit | undefined, token?: string): Promise<Response> => {
    const headers = new Headers(init?.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      return await fetch(`${baseURL}${path}`, { ...init, headers, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  return async (path: string, init?: RequestInit): Promise<Response> => {
    if (opts.target === 'auth' || !opts.credentialStore) {
      return send(path, init);
    }
    const store = opts.credentialStore;

    const token = await store.getAccessToken(opts.requiredScopes ?? []);
    const response = await send(path, init, token);

    if (response.status !== 401) {
      return response;
    }
    const refreshed = await store.forceRefresh();
    return send(path, init, refreshed);
  };
}

export async function assertResponseOk(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  const message = (await response.text()) || `${response.statusText} (${response.status})`;
  throw new Error(message);
}
