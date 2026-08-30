import type { Migration } from './types.js';

const pluginSourceTimeoutSeconds = 60;

const migration: Migration = {
  version: '2.1.18',
  description: 'plugin sources carry their stream timeout as a setting, defaulting to 60s',
  async up(ctx) {
    await ctx.db.camerasDB.transaction(() => {
      for (const { key, value: camera } of ctx.db.camerasDB.getRange()) {
        let touched = false;
        for (const source of camera.sources) {
          if (source.timeout || !source.urls.some((url) => url.startsWith('cui://'))) continue;
          source.timeout = pluginSourceTimeoutSeconds;
          touched = true;
        }
        if (!touched) continue;
        ctx.db.camerasDB.put(key, camera);
        ctx.logger.log(`Camera "${camera.name}": plugin sources wait ${pluginSourceTimeoutSeconds}s for video before reconnecting`);
      }
    });
  },
};

export default migration;
