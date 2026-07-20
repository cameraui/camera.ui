import { join } from 'node:path';

import { STORE_FILE_NAME } from '../../../plugins/store/pluginStoreFile.js';
import { readStoreFile } from '../../../plugins/store/storeFile.js';
import { DEFAULT_RECORDING_SETTINGS } from '../../schemas/cameras.schema.js';

import type { CameraRecordingSettings, RecordingMode, RecordingSource } from '@camera.ui/sdk';
import type { Migration, MigrationContext } from './types.js';

const NVR_PLUGIN_NAME = '@camera.ui/camera-ui-nvr';
const RECORDING_MODES = new Set<string>(['continuous', 'event', 'adhoc']);
const RECORDING_SOURCES = new Set<string>(['high', 'mid', 'low']);

function toRecordingSettings(nvr: Record<string, unknown>): CameraRecordingSettings {
  const sources = Array.isArray(nvr.recordedSources) ? nvr.recordedSources.filter((s): s is RecordingSource => RECORDING_SOURCES.has(s)) : [];

  return {
    enabled: typeof nvr.recordingEnabled === 'boolean' ? nvr.recordingEnabled : DEFAULT_RECORDING_SETTINGS.enabled,
    mode: typeof nvr.recordingMode === 'string' && RECORDING_MODES.has(nvr.recordingMode) ? (nvr.recordingMode as RecordingMode) : DEFAULT_RECORDING_SETTINGS.mode,
    preBuffer: typeof nvr.preBuffer === 'number' ? Math.min(60, Math.max(0, nvr.preBuffer)) : DEFAULT_RECORDING_SETTINGS.preBuffer,
    sources: sources.length ? sources : [...DEFAULT_RECORDING_SETTINGS.sources],
  };
}

async function migrateRecordingSettings(ctx: MigrationContext): Promise<void> {
  const storePath = join(ctx.configService.PLUGINS_STORAGE_PATH, NVR_PLUGIN_NAME, 'volume', STORE_FILE_NAME);

  let nvrCameras: Record<string, Record<string, unknown>> = {};
  try {
    nvrCameras = (await readStoreFile(storePath))?.cameras ?? {};
  } catch {
    // unreadable or missing store, cameras fall back to defaults
  }

  await ctx.db.camerasDB.transaction(() => {
    for (const { key, value: camera } of ctx.db.camerasDB.getRange()) {
      if ((camera as { recordingSettings?: unknown }).recordingSettings) continue;

      camera.recordingSettings = toRecordingSettings(nvrCameras[camera._id] ?? {});
      ctx.db.camerasDB.put(key, camera);
    }
  });
}

const migration: Migration = {
  version: '2.0.51',
  description: 'recording settings move from NVR plugin storage to the camera record',
  async up(ctx) {
    await migrateRecordingSettings(ctx);
  },
};

export default migration;
