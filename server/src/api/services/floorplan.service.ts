import { container } from 'tsyringe';

import { CamerasService } from './cameras.service.js';
import { RoomsService } from './rooms.service.js';

import type { Database } from '../database/index.js';
import type { DBFloorPlan, DBFloorPlanCamera, DBFloorPlanConnection, DBFloorPlanRoom, DBLevel, DBRoom } from '../database/types.js';
import type { PutFloorPlanInput } from '../schemas/floorplan.schema.js';
import type { SensorRegistry } from '../../sensors/registry.js';
import type { SocketService } from '../websocket/index.js';

const EMPTY_PLAN: DBFloorPlan = { version: 0, updatedAt: 0, north: null, rooms: [], connections: [], cameras: [], sensors: [] };

export class CatalogConflictError extends Error {
  constructor() {
    super('The rooms changed while the floor plan was open');
  }
}

export class FloorPlanService {
  private dbs: Database;
  private roomsService: RoomsService;

  constructor() {
    this.dbs = container.resolve<Database>('dbs');
    this.roomsService = new RoomsService();
  }

  public get(): DBFloorPlan {
    return this.dbs.floorPlanDB.get('floorplan') ?? EMPTY_PLAN;
  }

  public async replace(input: PutFloorPlanInput): Promise<DBFloorPlan> {
    const before = this.roomsService.get();
    if (input.catalogVersion !== before.version) throw new CatalogConflictError();

    const levels: DBLevel[] = input.levels;

    const rooms: DBRoom[] = [];
    for (const shape of input.rooms) {
      if (rooms.some((room) => room.id === shape.roomId)) continue;
      rooms.push({ id: shape.roomId, name: shape.name, levelId: shape.levelId, outdoor: shape.outdoor, publicSpace: shape.publicSpace, note: shape.note });
    }

    const stored = new Set(this.get().rooms.map((shape) => shape.roomId));
    const sent = new Set(rooms.map((room) => room.id));
    const undrawn = before.rooms.filter((room) => !sent.has(room.id) && !stored.has(room.id));

    const catalog = await this.roomsService.apply(levels, [...rooms, ...undrawn]);
    const known = new Map(catalog.rooms.map((room) => [room.id, room]));

    const plan = await this.dbs.commit(this.dbs.floorPlanDB, 'floorplan', (current) => ({
      ...this.sanitize(input, known),
      version: (current?.version ?? 0) + 1,
      updatedAt: Date.now(),
    }));

    if (!plan) return this.get();

    await this.syncCameraRooms(plan, known);
    this.emit(plan);

    return plan;
  }

  public async dropCameras(cameraIds: string[]): Promise<void> {
    const current = this.get();
    const drop = new Set(cameraIds);
    if (!current.cameras.some((camera) => drop.has(camera.cameraId))) return;

    const plan = await this.dbs.commit(this.dbs.floorPlanDB, 'floorplan', (record) => {
      if (!record) return undefined;

      record.cameras = record.cameras.filter((camera) => !drop.has(camera.cameraId));
      record.version += 1;
      record.updatedAt = Date.now();

      return record;
    });

    if (plan) this.emit(plan);
  }

  public async dropSensors(sensorIds: string[]): Promise<void> {
    const current = this.get();
    const drop = new Set(sensorIds);
    if (!current.sensors.some((sensor) => drop.has(sensor.sensorId))) return;

    const plan = await this.dbs.commit(this.dbs.floorPlanDB, 'floorplan', (record) => {
      if (!record) return undefined;

      record.sensors = record.sensors.filter((sensor) => !drop.has(sensor.sensorId));
      record.version += 1;
      record.updatedAt = Date.now();

      return record;
    });

    if (plan) this.emit(plan);
  }

  public async dropRoom(roomId: string): Promise<void> {
    const plan = await this.dbs.commit(this.dbs.floorPlanDB, 'floorplan', (record) => {
      if (!record) return undefined;
      if (!record.rooms.some((room) => room.roomId === roomId)) return undefined;

      const gone = new Set(
        record.connections.filter((connection) => connection.fromRoomId === roomId || connection.toRoomId === roomId).map((connection) => connection.id),
      );

      record.rooms = record.rooms.filter((room) => room.roomId !== roomId);
      record.connections = record.connections.filter((connection) => !gone.has(connection.id));
      record.cameras = record.cameras.filter((camera) => camera.roomId !== roomId);
      record.sensors = record.sensors.filter((sensor) => sensor.roomId !== roomId);
      for (const sensor of record.sensors) {
        if (sensor.connectionId && gone.has(sensor.connectionId)) sensor.connectionId = null;
      }
      record.version += 1;
      record.updatedAt = Date.now();

      return record;
    });

    if (plan) this.emit(plan);
  }

  private sanitize(input: PutFloorPlanInput, rooms: Map<string, DBRoom>): Omit<DBFloorPlan, 'version' | 'updatedAt'> {
    const shapes: DBFloorPlanRoom[] = [];
    for (const room of input.rooms) {
      if (!rooms.has(room.roomId)) continue;
      shapes.push({ id: room.id, roomId: room.roomId, x: room.x, y: room.y, width: room.width, height: room.height });
    }
    const drawn = new Set(shapes.map((shape) => shape.roomId));
    const shapeIds = new Set(shapes.map((shape) => shape.id));

    const seen = new Set<string>();
    const connections: DBFloorPlanConnection[] = [];
    for (const connection of input.connections) {
      if (connection.fromRoomId === connection.toRoomId) continue;

      const from = rooms.get(connection.fromRoomId);
      const to = rooms.get(connection.toRoomId);
      if (!from || !to || !drawn.has(from.id) || !drawn.has(to.id)) continue;

      const fromShapeId = connection.fromShapeId && shapeIds.has(connection.fromShapeId) ? connection.fromShapeId : null;
      const toShapeId = connection.toShapeId && shapeIds.has(connection.toShapeId) ? connection.toShapeId : null;

      if (seen.has(connection.id)) continue;

      seen.add(connection.id);

      // stairs are the level change itself, a door into the stairwell stays a door
      const type = from.levelId !== to.levelId ? 'stairs' : connection.type === 'stairs' ? 'door' : connection.type;

      connections.push({ ...connection, fromShapeId, toShapeId, type });
    }

    const cameras: DBFloorPlanCamera[] = [];
    for (const camera of input.cameras) {
      if (!drawn.has(camera.roomId)) continue;
      if (!this.dbs.camerasDB.get(camera.cameraId)) continue;

      cameras.push(camera);
    }

    const known = new Set(connections.map((connection) => connection.id));
    const sensors = input.sensors.filter((sensor) => drawn.has(sensor.roomId) && this.sensorExists(sensor.sensorId));
    for (const sensor of sensors) {
      if (sensor.connectionId && !known.has(sensor.connectionId)) sensor.connectionId = null;
    }

    return { north: input.north, rooms: shapes, connections, cameras, sensors };
  }

  private sensorExists(sensorId: string): boolean {
    try {
      return container.resolve<SensorRegistry>('sensorRegistry').getRecord(sensorId) !== undefined;
    } catch {
      return true;
    }
  }

  private async syncCameraRooms(plan: DBFloorPlan, rooms: Map<string, DBRoom>): Promise<void> {
    const camerasService = new CamerasService();
    const placed = new Map(plan.cameras.map((camera) => [camera.cameraId, camera.roomId]));

    for (const camera of camerasService.list()) {
      const roomId = placed.get(camera._id) ?? camera.roomId;
      if (roomId && rooms.has(roomId)) {
        await camerasService.assignRoom(camera._id, roomId);
        continue;
      }
      await camerasService.assignRoom(camera._id, (await this.roomsService.fallback()).id);
    }
  }

  private emit(plan: DBFloorPlan): void {
    try {
      container.resolve<SocketService>('socketService').io.of('/camera.ui').emit('floorplan-changed', plan);
    } catch {
      // ignore
    }
  }
}
