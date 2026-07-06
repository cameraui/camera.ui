import { getConnection } from '@/connection/instance.js';

import type { AxiosInstance } from '@camera.ui/transport/transports/http';

// Routes import `axiosInstance` at module-load time, before `bootApp()`
// resolves. The Proxy lazy-resolves the real HTTP transport client on first
// property access — `getConnection()` throws if called pre-boot.
let _client: AxiosInstance | null = null;

export function resolveAxiosClient(): AxiosInstance {
  if (_client) return _client;
  _client = getConnection().http.client;
  return _client;
}

export const axiosInstance: AxiosInstance = new Proxy({} as AxiosInstance, {
  get(_, prop) {
    return Reflect.get(resolveAxiosClient(), prop, resolveAxiosClient());
  },
  set(_, prop, value) {
    return Reflect.set(resolveAxiosClient(), prop, value, resolveAxiosClient());
  },
});
