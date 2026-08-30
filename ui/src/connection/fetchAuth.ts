import { getConnection } from './instance.js';

export type FetchAuthorizer = () => Promise<Record<string, string>>;

let authorizer: FetchAuthorizer | null = null;

export function setFetchAuthorizer(fn: FetchAuthorizer | null): void {
  authorizer = fn;
}

export async function fetchAuthHeaders(): Promise<Record<string, string>> {
  if (authorizer) return authorizer();
  const headers: Record<string, string> = {};
  const tokens = getConnection().target.value?.tokens;
  if (tokens?.access) headers.Authorization = `Bearer ${tokens.access}`;
  if (tokens?.proxySession) headers['X-Proxy-Session'] = tokens.proxySession;
  return headers;
}
