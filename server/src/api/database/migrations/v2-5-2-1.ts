import type { Migration } from './types.js';

const migration: Migration = {
  version: '2.5.2-1',
  description: 'Sensors on the floor plan take the room they sit in',
  async up(ctx) {
    const placements = ctx.db.floorPlanDB.get('floorplan')?.sensors ?? [];
    await ctx.db.sensorsDB.transaction(() => {
      for (const placement of placements) {
        const sensor = ctx.db.sensorsDB.get(placement.sensorId);
        if (!sensor || sensor.boundCameraId || sensor.roomId) continue;
        sensor.roomId = placement.roomId;
        ctx.db.sensorsDB.put(placement.sensorId, sensor);
      }
    });
  },
};

export default migration;
