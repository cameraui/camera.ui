import { CLOUD_SERVICE_URL } from '@/common/constants.js';
import { bootConnectionInstance } from './instance.js';
import { buildCloudMode } from './modes/cloud.js';
import { detectMode } from './modes/detectMode.js';
import { buildDirectMode } from './modes/direct.js';
import { isCapacitor } from './runtime.js';

import type { Logger } from '@camera.ui/logger';
import type { AuthApi, CloudSessionHolder, Connection, ConnectionMode } from './types.js';

export interface BootResult {
  readonly connection: Connection;
  readonly api: AuthApi;
  readonly mode: ConnectionMode;
  readonly cloudSession?: CloudSessionHolder;
}

export interface BootOptions {
  readonly logger?: Logger;
}

let _bootResult: BootResult | null = null;

export async function bootApp(opts: BootOptions = {}): Promise<BootResult> {
  if (_bootResult) return _bootResult;

  const detected = await detectMode();

  if (detected.mode === 'cloud') {
    if (!detected.cloudSession) {
      if (isCapacitor) {
        window.location.href = '../index.html';
      } else {
        window.location.href = CLOUD_SERVICE_URL;
      }
      throw new Error('cloud handoff incomplete — bouncing to cloud frontend');
    }
    const { options, api, cloudSession } = buildCloudMode({
      initialSession: detected.cloudSession,
      logger: opts.logger,
    });
    const connection = bootConnectionInstance(options);
    _bootResult = { connection, api, mode: 'cloud', cloudSession };
    return _bootResult;
  }

  if (!detected.directEndpointUrl) {
    throw new Error('direct mode detected but no endpoint URL resolved');
  }
  const { options, api } = buildDirectMode(detected.directEndpointUrl, opts.logger);
  const connection = bootConnectionInstance(options);
  _bootResult = { connection, api, mode: 'direct' };
  return _bootResult;
}

export function getBootResult(): BootResult {
  if (!_bootResult) throw new Error('getBootResult(): app not booted — call bootApp() first');
  return _bootResult;
}

export function useAuthApi(): BootResult['api'] {
  return getBootResult().api;
}

export function useBootMode(): BootResult['mode'] {
  return getBootResult().mode;
}

export function useCloudSession(): BootResult['cloudSession'] {
  return getBootResult().cloudSession;
}
