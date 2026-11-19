import type { Migration } from './types.js';

interface LegacySource {
  role: string;
  onvifDisabled?: boolean;
  rtmpDisabled?: boolean;
}

const migration: Migration = {
  version: '2.5.2',
  description: 'ONVIF and RTMP are set per camera instead of per source',
  async up(ctx) {
    await ctx.db.camerasDB.transaction(() => {
      for (const { key, value: camera } of ctx.db.camerasDB.getRange()) {
        const sources = camera.sources as LegacySource[];
        camera.exportSettings = { onvif: false, rtmp: sources.some((source) => source.role !== 'snapshot' && !source.rtmpDisabled) };
        for (const source of sources) {
          delete source.onvifDisabled;
          delete source.rtmpDisabled;
        }
        ctx.db.camerasDB.put(key, camera);
      }
    });
  },
};

export default migration;
