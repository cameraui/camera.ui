import type { Migration } from './types.js';

const pluginSourceHandshakeTimeoutSeconds = 15;

const migration: Migration = {
  version: '2.1.19',
  description: 'plugin sources carry a handshake timeout that covers a slow-waking camera',
  async up(ctx) {
    await ctx.db.camerasDB.transaction(() => {
      for (const { key, value: camera } of ctx.db.camerasDB.getRange()) {
        let touched = false;
        for (const source of camera.sources) {
          if (source.handshakeTimeout || !source.urls.some((url) => url.startsWith('cui://'))) continue;
          source.handshakeTimeout = pluginSourceHandshakeTimeoutSeconds;
          touched = true;
        }
        if (!touched) continue;
        ctx.db.camerasDB.put(key, camera);
        ctx.logger.log(`Camera "${camera.name}": plugin sources wait ${pluginSourceHandshakeTimeoutSeconds}s for the connection handshake`);
      }
    });
  },
};

export default migration;
