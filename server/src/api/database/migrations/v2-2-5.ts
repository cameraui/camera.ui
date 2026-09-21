import type { Migration } from './types.js';

interface LegacyFaceSettings {
  confidence?: number;
  matchThreshold?: number;
  matchSensitivity?: string;
}

const migration: Migration = {
  version: '2.2.5',
  description: 'face recognition is set by sensitivity instead of a similarity threshold',
  async up(ctx) {
    await ctx.db.camerasDB.transaction(() => {
      for (const { key, value: camera } of ctx.db.camerasDB.getRange()) {
        const face = camera.detectionSettings?.face as LegacyFaceSettings | undefined;
        if (!face || face.matchSensitivity) continue;
        delete face.matchThreshold;
        face.matchSensitivity = 'balanced';
        ctx.db.camerasDB.put(key, camera);
      }
      ctx.logger.log('Face recognition sensitivity set to balanced on every camera');
    });
  },
};

export default migration;
