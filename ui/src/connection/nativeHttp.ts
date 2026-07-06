import { applyNativeHttp } from '@camera.ui/transport/transports/nativeHttp';

import { isCapacitor } from './runtime.js';

import type { AxiosInstance } from 'axios';

export function installNativeHttp(client: AxiosInstance): void {
  applyNativeHttp(client, {
    enabled: isCapacitor,
    extraHeaders: { 'Accept-Encoding': 'identity' },
    request: async (init) => {
      const { CapacitorHttp } = await import('@capacitor/core');
      return CapacitorHttp.request(init);
    },
  });
}
