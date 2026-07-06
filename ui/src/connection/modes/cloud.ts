/* eslint-disable @stylistic/indent */
import { createNetworkAdapters } from '../adapters/network.js';
import { createStorageAdapter } from '../adapters/storage.js';
import { createVisibilitySource } from '../adapters/visibility.js';
import { createAuthApi } from '../auth/api.js';
import { createDiscoverCloud } from '../auth/discover.js';
import { createProbe } from '../auth/probe.js';
import { createRefresh } from '../auth/refresh.js';
import { clearCapacitorCloudPreferences } from '../cloudHandoff.js';
import { createCloudSession } from '../cloudSession.js';
import { createCloudSessionLifecycle } from '../cloudSessionLifecycle.js';
import { isCapacitor } from '../runtime.js';

import type { Logger } from '@camera.ui/logger';
import type { CloudSessionLifecycle } from '../cloudSessionLifecycle.js';
import type { AuthApi, CloudSession, CloudSessionHolder, ConnectionOptions } from '../types.js';

export interface CloudModeBundle {
  readonly options: ConnectionOptions;
  readonly api: AuthApi;
  readonly cloudSession: CloudSessionHolder;
  readonly cloudSessionLifecycle: CloudSessionLifecycle;
}

export interface CloudModeOptions {
  readonly initialSession: CloudSession;
  readonly logger?: Logger;
}

export function buildCloudMode(options: CloudModeOptions): CloudModeBundle {
  const api = createAuthApi();
  const cloudSession = createCloudSession(options.initialSession);
  const network = createNetworkAdapters();

  const cloudSessionLifecycle = createCloudSessionLifecycle({
    api,
    cloudSession,
    readL1AccessToken: isCapacitor ? readL1AccessTokenFromSecureStorage : undefined,
    onL1Unavailable: isCapacitor
      ? async () => {
          // Cloud session is dead AND no L1 fallback worked (no SecureStorage
          // AT or it got rejected). Hand control back to the cloud frontend
          await clearCapacitorCloudPreferences();
          window.location.href = '../index.html';
        }
      : async () => {
          // Web cloud: bounce to the cloud frontend at the cloud service URL
          // (e.g., cloud.cameraui.com) for re-auth.
          window.location.href = options.initialSession.cloudApiBase ? `${options.initialSession.cloudApiBase}/` : '/';
        },
    logger: options.logger,
  });

  const storage = createStorageAdapter();
  const serverId = options.initialSession.serverId;
  const discover = createDiscoverCloud({ api, cloudSession, cloudSessionLifecycle, storage, serverId, logger: options.logger });
  const refresh = createRefresh(api);

  const connectionOptions: ConnectionOptions = {
    adapters: {
      storage,
      visibilitySource: createVisibilitySource(),
      networkSource: network.networkSource,
      networkChangeSource: network.networkChangeSource,
    },
    callbacks: {
      discover,
      probe: createProbe(api, refresh),
      refresh: refresh.refresh,
      bindRefresh: refresh.bindCoordination,
      onConnectionReset: refresh.clear,
      onWake: () => cloudSessionLifecycle.wake(),
    },
    storageNamespace: serverId,
    logger: options.logger,
  };

  return { options: connectionOptions, api, cloudSession, cloudSessionLifecycle };
}

async function readL1AccessTokenFromSecureStorage(): Promise<string | null> {
  try {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    const value = await SecureStorage.get('accessToken');
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}
