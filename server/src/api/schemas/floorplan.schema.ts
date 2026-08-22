import * as zod from 'zod';

export const floorPlanLevelSchema = zod.object({
  id: zod.string().trim().min(1),
  name: zod.string().trim().min(1, 'Level name is required').max(64),
  order: zod.number().int().min(0).default(0),
});

export const floorPlanRoomSchema = zod.object({
  id: zod.string().trim().min(1),
  roomId: zod.string().trim().min(1),
  name: zod.string().trim().min(1, 'Room name is required').max(64),
  levelId: zod.string().trim().min(1),
  outdoor: zod.boolean().default(false),
  publicSpace: zod.boolean().default(false),
  note: zod.string().trim().max(240).default(''),
  x: zod.number(),
  y: zod.number(),
  width: zod.number().min(1),
  height: zod.number().min(1),
});

export const floorPlanConnectionSchema = zod.object({
  id: zod.string().trim().min(1),
  fromRoomId: zod.string().trim().min(1),
  toRoomId: zod.string().trim().min(1),
  fromShapeId: zod.string().trim().min(1).nullable().default(null),
  toShapeId: zod.string().trim().min(1).nullable().default(null),
  offset: zod.number().nullable().default(null),
  width: zod.number().min(10).max(2000).default(90),
  note: zod.string().trim().max(240).default(''),
  type: zod.enum(['door', 'opening', 'stairs']).default('door'),
});

export const floorPlanCameraSchema = zod.object({
  cameraId: zod.string().trim().min(1),
  roomId: zod.string().trim().min(1),
  note: zod.string().trim().max(240).default(''),
  x: zod.number(),
  y: zod.number(),
  rotation: zod.number(),
  fov: zod.number().min(1).max(360),
  range: zod.number().min(1),
});

export const floorPlanSensorSchema = zod.object({
  sensorId: zod.string().trim().min(1),
  sensorType: zod.string().trim().min(1),
  roomId: zod.string().trim().min(1),
  connectionId: zod.string().trim().min(1).nullable().default(null),
  note: zod.string().trim().max(240).default(''),
  x: zod.number(),
  y: zod.number(),
});

export const putFloorPlanSchema = zod
  .object({
    catalogVersion: zod.number().int().min(0),
    north: zod.number().nullable().default(null),
    levels: floorPlanLevelSchema.array().max(20),
    rooms: floorPlanRoomSchema.array().max(200),
    connections: floorPlanConnectionSchema.array().max(500),
    cameras: floorPlanCameraSchema.array().max(500),
    sensors: floorPlanSensorSchema.array().max(500),
  })
  .strict();

export type PutFloorPlanInput = zod.output<typeof putFloorPlanSchema>;
