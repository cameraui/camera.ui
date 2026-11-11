/* eslint-disable @stylistic/indent */
import { createNetworkAdapters } from '../adapters/network.js';
import { createStorageAdapter } from '../adapters/storage.js';
import { createVisibilitySource } from '../adapters/visibility.js';
import { createWakeSource } from '../adapters/wake.js';
import { createAuthApi } from '../auth/api.js';
import { createDiscoverCloud } from '../auth/discover.js';
import { createProbe } from '../auth/probe.js';
import { createRefresh } from '../auth/refresh.js';
import { bounceToCloudFrontend } from '../cloudHandoff.js';
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
      ? bounceToCloudFrontend
      : async () => {
          window.location.href = options.initialSession.cloudApiBase ? `${options.initialSession.cloudApiBase}/` : '/';
        },
    logger: options.logger,
  });

  if (isCapacitor) {
    watch(cloudSession.state, (session, previous) => {
      if (session && session.proxyToken !== previous?.proxyToken) storeRotatedPair(cloudSession, session);
    });
  }

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
      wakeSource: createWakeSource(),
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

async function storeRotatedPair(cloudSession: CloudSessionHolder, session: CloudSession): Promise<void> {
  try {
    const [{ Preferences }, { SecureStorage }] = await Promise.all([import('@capacitor/preferences'), import('@aparajita/capacitor-secure-storage')]);
    if (cloudSession.state.value !== session) return;
    const refreshExpiresAt = session.proxyRefreshToken ? session.proxyRefreshTokenExpiresAt : undefined;
    await Promise.all([
      SecureStorage.set('proxyAuthToken', session.proxyToken),
      session.proxyRefreshToken ? SecureStorage.set('proxyRefreshToken', session.proxyRefreshToken) : SecureStorage.remove('proxyRefreshToken'),
      Preferences.set({ key: 'mobileOrigin', value: new URL(session.proxyUrl).origin }),
      session.proxyTokenExpiresAt
        ? Preferences.set({ key: 'proxyTokenExpiresAt', value: String(session.proxyTokenExpiresAt) })
        : Preferences.remove({ key: 'proxyTokenExpiresAt' }),
      refreshExpiresAt
        ? Preferences.set({ key: 'proxyRefreshTokenExpiresAt', value: String(refreshExpiresAt) })
        : Preferences.remove({ key: 'proxyRefreshTokenExpiresAt' }),
    ]);
  } catch {
    // the next cold start falls back to the older pair
  }
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
