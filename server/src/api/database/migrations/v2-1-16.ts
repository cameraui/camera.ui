import { randomUUID } from 'node:crypto';

import type { DBFloorPlanRoom } from '../types.js';
import type { Migration } from './types.js';

function touches(a: DBFloorPlanRoom, b: DBFloorPlanRoom): boolean {
  const epsilon = 1;
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

  if (Math.abs(a.x + a.width - b.x) < epsilon || Math.abs(b.x + b.width - a.x) < epsilon) return overlapY > 0;
  if (Math.abs(a.y + a.height - b.y) < epsilon || Math.abs(b.y + b.height - a.y) < epsilon) return overlapX > 0;
  return false;
}

const migration: Migration = {
  version: '2.1.16',
  description: 'a connection remembers the wall it sits on, not just the two rooms',
  async up(ctx) {
    const plan = ctx.db.floorPlanDB.get('floorplan');
    if (!plan) return;

    for (const shape of plan.rooms) {
      shape.id ??= randomUUID();
    }

    for (const connection of plan.connections) {
      if (connection.fromShapeId && connection.toShapeId) continue;

      const fromParts = plan.rooms.filter((shape) => shape.roomId === connection.fromRoomId);
      const toParts = plan.rooms.filter((shape) => shape.roomId === connection.toRoomId);

      const pair = fromParts.flatMap((from) => toParts.map((to) => ({ from, to }))).find((candidate) => touches(candidate.from, candidate.to));

      connection.fromShapeId = pair?.from.id ?? fromParts[0]?.id ?? null;
      connection.toShapeId = pair?.to.id ?? toParts[0]?.id ?? null;
    }

    await ctx.db.floorPlanDB.put('floorplan', plan);

    ctx.logger.log(`Floor plan: ${plan.rooms.length} rectangles now have an id, ${plan.connections.length} connection(s) know their wall`);
  },
};

export default migration;
