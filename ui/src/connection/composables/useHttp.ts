import { getConnection } from '../instance.js';

import type { AxiosInstance } from '@camera.ui/transport/transports/http';

export function useHttp(): AxiosInstance {
  return getConnection().http.client;
}
