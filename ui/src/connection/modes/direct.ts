import { createNetworkAdapters } from '../adapters/network.js';
import { createStorageAdapter } from '../adapters/storage.js';
import { createVisibilitySource } from '../adapters/visibility.js';
import { createAuthApi } from '../auth/api.js';
import { createDiscoverDirect } from '../auth/discover.js';
import { createProbe } from '../auth/probe.js';
import { createRefresh } from '../auth/refresh.js';

import type { Logger } from '@camera.ui/logger';
import type { AuthApi, ConnectionOptions } from '../types.js';

export interface DirectModeBundle {
  readonly options: ConnectionOptions;
  readonly api: AuthApi;
}

export function buildDirectMode(endpointUrl: string, logger?: Logger): DirectModeBundle {
  const api = createAuthApi();
  const network = createNetworkAdapters();
  const refresh = createRefresh(api);

  const options: ConnectionOptions = {
    adapters: {
      storage: createStorageAdapter(),
      visibilitySource: createVisibilitySource(),
      networkSource: network.networkSource,
      networkChangeSource: network.networkChangeSource,
    },
    callbacks: {
      discover: createDiscoverDirect(endpointUrl),
      probe: createProbe(api, refresh),
      refresh: refresh.refresh,
      bindRefresh: refresh.bindCoordination,
      onConnectionReset: refresh.clear,
    },
    logger,
  };

  return { options, api };
}
