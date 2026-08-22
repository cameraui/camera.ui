import { randomUUID } from 'node:crypto';

import type { DBLevel, DBRoom, DBRoomCatalog } from '../types.js';
import type { Migration, MigrationContext } from './types.js';

interface OldRoom {
  id: string;
  name: string;
  levelId: string;
  outdoor: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OldCamera {
  cameraId: string;
  levelId: string;
  roomId: string | null;
  x: number;
  y: number;
  rotation: number;
  fov: number;
  range: number;
}

interface OldConnection {
  id: string;
  fromRoomId: string;
  toRoomId: string;
  type: 'door' | 'opening' | 'stairs';
}

interface LegacyPlan {
  version: number;
  updatedAt: number;
  north: number | null;
  rooms: { roomId: string; x: number; y: number; width: number; height: number }[];
  connections: OldConnection[];
  cameras: { cameraId: string; roomId: string; x: number; y: number; rotation: number; fov: number; range: number }[];
}

interface OldPlan {
  version: number;
  updatedAt: number;
  north: number | null;
  levels: DBLevel[];
  rooms: OldRoom[];
  connections: OldConnection[];
  cameras: OldCamera[];
}

function touches(a: OldRoom, b: OldRoom): boolean {
  const epsilon = 1;
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

  if (Math.abs(a.x + a.width - b.x) < epsilon || Math.abs(b.x + b.width - a.x) < epsilon) return overlapY > 0;
  if (Math.abs(a.y + a.height - b.y) < epsilon || Math.abs(b.y + b.height - a.y) < epsilon) return overlapX > 0;
  return false;
}

function find(parent: Map<string, string>, id: string): string {
  let root = id;
  while (parent.get(root) !== root) root = parent.get(root)!;
  return root;
}

function mergeRectangles(rooms: OldRoom[], connections: OldConnection[]): Map<string, string> {
  const parent = new Map(rooms.map((room) => [room.id, room.id]));
  const connected = new Set(connections.map((connection) => [connection.fromRoomId, connection.toRoomId].sort().join('|')));

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      if (a.levelId !== b.levelId || a.name !== b.name) continue;
      if (!touches(a, b) || !connected.has([a.id, b.id].sort().join('|'))) continue;

      const rootA = find(parent, a.id);
      const rootB = find(parent, b.id);
      if (rootA !== rootB) parent.set(rootA, rootB);
    }
  }

  return new Map(rooms.map((room) => [room.id, find(parent, room.id)]));
}

function disambiguate(rooms: DBRoom[], connections: OldConnection[], logger: MigrationContext['logger']): void {
  const neighbours = new Map<string, Set<string>>(rooms.map((room) => [room.id, new Set<string>()]));
  const byId = new Map(rooms.map((room) => [room.id, room]));

  for (const connection of connections) {
    const from = byId.get(connection.fromRoomId);
    const to = byId.get(connection.toRoomId);
    if (!from || !to || from.id === to.id) continue;
    neighbours.get(from.id)?.add(to.name);
    neighbours.get(to.id)?.add(from.name);
  }

  const groups = new Map<string, DBRoom[]>();
  for (const room of rooms) {
    const key = `${room.levelId} ${room.name.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), room]);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const taken = new Set<string>();
    for (const room of group) {
      const others = new Set<string>();
      for (const sibling of group) {
        if (sibling.id === room.id) continue;
        for (const name of neighbours.get(sibling.id) ?? []) others.add(name);
      }

      const candidates = [...(neighbours.get(room.id) ?? [])].filter((name) => !others.has(name) && name !== room.name).sort();
      const previous = room.name;

      room.name = candidates.length > 0 ? `${previous} (${candidates[0]})` : nextFree(previous, taken);
      taken.add(room.name.toLowerCase());

      logger.log(`Room "${previous}" renamed to "${room.name}", room names are unique per level now`);
    }
  }
}

function nextFree(name: string, taken: Set<string>): string {
  for (let suffix = 2; ; suffix++) {
    const candidate = `${name} ${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

function buildCatalog(plan: OldPlan | undefined, logger: MigrationContext['logger']): { catalog: DBRoomCatalog; plan: LegacyPlan; roomOf: Map<string, string> } {
  const levels = plan?.levels ?? [];
  const oldRooms = plan?.rooms ?? [];
  const connections = plan?.connections ?? [];

  const roomOf = mergeRectangles(oldRooms, connections);

  const rooms: DBRoom[] = [];
  for (const room of oldRooms) {
    if (roomOf.get(room.id) !== room.id) continue;
    rooms.push({ id: room.id, name: room.name, levelId: room.levelId, outdoor: room.outdoor, publicSpace: false, note: '' });
  }

  const remapped = connections
    .map((connection) => ({ ...connection, fromRoomId: roomOf.get(connection.fromRoomId)!, toRoomId: roomOf.get(connection.toRoomId)! }))
    .filter((connection) => connection.fromRoomId && connection.toRoomId && connection.fromRoomId !== connection.toRoomId);

  disambiguate(rooms, remapped, logger);

  const seen = new Set<string>();
  const kept = remapped
    .map((connection) => ({ ...connection, fromShapeId: null, toShapeId: null }))
    .filter((connection) => {
      const key = [connection.fromRoomId, connection.toRoomId].sort().join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return {
    catalog: { version: 1, updatedAt: Date.now(), levels, rooms },
    plan: {
      version: (plan?.version ?? 0) + 1,
      updatedAt: Date.now(),
      north: plan?.north ?? null,
      rooms: oldRooms.map((room) => ({ roomId: roomOf.get(room.id)!, x: room.x, y: room.y, width: room.width, height: room.height })),
      connections: kept,
      cameras: (plan?.cameras ?? [])
        .filter((camera) => camera.roomId && roomOf.has(camera.roomId))
        .map((camera) => ({
          cameraId: camera.cameraId,
          roomId: roomOf.get(camera.roomId!)!,
          x: camera.x,
          y: camera.y,
          rotation: camera.rotation,
          fov: camera.fov,
          range: camera.range,
        })),
    },
    roomOf,
  };
}

const migration: Migration = {
  version: '2.1.15',
  description: 'rooms and levels become a catalogue of their own, the floor plan only draws them',
  async up(ctx) {
    const oldPlan = ctx.db.floorPlanDB.get('floorplan') as unknown as OldPlan | undefined;
    const { catalog, plan } = buildCatalog(oldPlan, ctx.logger);

    const placedIn = new Map(plan.cameras.map((camera) => [camera.cameraId, camera.roomId]));
    const byName = new Map(catalog.rooms.map((room) => [room.name.toLowerCase(), room]));

    await ctx.db.camerasDB.transaction(() => {
      for (const { key, value: camera } of ctx.db.camerasDB.getRange()) {
        const name = camera.room?.trim() || 'Default';
        let roomId = placedIn.get(camera._id);

        if (!roomId) {
          const existing = byName.get(name.toLowerCase());
          const room: DBRoom = existing ?? { id: randomUUID(), name, levelId: null, outdoor: false, publicSpace: false, note: '' };
          if (!existing) {
            catalog.rooms.push(room);
            byName.set(name.toLowerCase(), room);
          }
          roomId = room.id;
        }

        camera.roomId = roomId;
        camera.room = catalog.rooms.find((room) => room.id === roomId)?.name ?? name;
        ctx.db.camerasDB.put(key, camera);
      }
    });

    await ctx.db.roomsDB.put('rooms', catalog);

    await ctx.db.floorPlanDB.put('floorplan', plan as unknown as Parameters<typeof ctx.db.floorPlanDB.put>[1]);

    ctx.logger.log(`Rooms: ${catalog.rooms.length} in the catalogue, ${plan.rooms.length} rectangles drawn on ${catalog.levels.length} level(s)`);
  },
};

export default migration;
