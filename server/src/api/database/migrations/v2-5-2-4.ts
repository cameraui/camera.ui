import type { Migration } from './types.js';

const migration: Migration = {
  version: '2.5.2-4',
  description: 'Cameras get a privacy mode, off',
  async up(ctx) {
    await ctx.db.camerasDB.transaction(() => {
      for (const { key, value: camera } of ctx.db.camerasDB.getRange()) {
        if (camera.privacy) continue;
        camera.privacy = { enabled: false, pauseRecording: false };
        ctx.db.camerasDB.put(key, camera);
      }
    });
  },
};

export default migration;
