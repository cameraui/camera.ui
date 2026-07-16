import { normalizeSwitchCaseHandles } from '../../../automations/switchHandles.js';

import type { Migration, MigrationContext } from './types.js';

const MAX_LEAD_MS = 4000;
const BLIND_TIME_SECONDS = 1.8;

function leadFramesToMs(leadFrames: number, fps: number): number {
  if (leadFrames === 0) return 0;
  return Math.min(MAX_LEAD_MS, Math.round((Math.max(leadFrames, BLIND_TIME_SECONDS * fps) / fps) * 1000));
}

async function migratePtzLead(ctx: MigrationContext): Promise<void> {
  await ctx.db.camerasDB.transaction(() => {
    for (const { key, value: camera } of ctx.db.camerasDB.getRange()) {
      const autotrack = camera?.ptzAutotrack as unknown as Record<string, unknown> | undefined;
      if (!autotrack || typeof autotrack.leadFrames !== 'number') continue;

      const fps = camera.frameWorkerSettings?.fps || 10;
      autotrack.leadMs = leadFramesToMs(autotrack.leadFrames, fps);
      delete autotrack.leadFrames;

      ctx.db.camerasDB.put(key, camera);
    }
  });
}

async function migrateSwitchHandles(ctx: MigrationContext): Promise<void> {
  await ctx.db.automationsDB.transaction(() => {
    for (const { key, value: flow } of ctx.db.automationsDB.getRange()) {
      if (!flow?.nodes?.some((n) => n.type === 'condition-switch')) continue;

      const result = normalizeSwitchCaseHandles(flow);
      if (!result.changed) continue;

      flow.updatedAt = Date.now();
      ctx.db.automationsDB.put(key, flow);
    }
  });
}

const migration: Migration = {
  version: '2.0.50',
  description: 'ptz autotrack leadFrames to leadMs, switch conditions route by case handle',
  async up(ctx) {
    await migratePtzLead(ctx);
    await migrateSwitchHandles(ctx);
  },
};

export default migration;
