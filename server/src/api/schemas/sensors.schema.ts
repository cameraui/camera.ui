import * as zod from 'zod';

import { VIRTUAL_SENSOR_TYPES } from '../../sensors/types.js';

import type { VirtualSensorType } from '../../sensors/types.js';

export const sensorParamsSchema = zod.object({
  id: zod.string().min(1, 'Sensor ID is required'),
});

export const createVirtualSensorSchema = zod.object({
  cameraId: zod.string().min(1).optional(),
  type: zod.enum(VIRTUAL_SENSOR_TYPES as [VirtualSensorType, ...VirtualSensorType[]]),
  name: zod.string().trim().min(1, 'Name is required').max(100, 'Name cannot be more than 100 characters'),
  capabilities: zod.array(zod.string().min(1)).optional(),
  sources: zod.array(zod.string().trim().min(1).max(64)).max(96).optional(),
  kind: zod.string().min(1).max(32).optional(),
  exposed: zod.boolean().optional(),
  deviceId: zod.string().min(1).optional(),
});

export const patchSensorSchema = zod
  .object({
    displayName: zod.string().trim().min(1, 'Display name is required').max(100, 'Display name cannot be more than 100 characters').optional(),
    assignedCameraIds: zod.array(zod.string().min(1)).optional(),
    exposed: zod.boolean().optional(),
    deviceId: zod.string().min(1).nullable().optional(),
    roomId: zod.string().min(1).max(100).nullable().optional(),
    capabilities: zod.array(zod.string().min(1)).optional(),
    sources: zod.array(zod.string().trim().min(1).max(64)).max(96).optional(),
    kind: zod.string().min(1).max(32).optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Nothing to update',
  });

export const createSensorDeviceSchema = zod.object({
  name: zod.string().trim().min(1, 'Name is required').max(100, 'Name cannot be more than 100 characters'),
  sensorIds: zod.array(zod.string().min(1)).min(1).max(100),
});

export const patchSensorDeviceSchema = zod
  .object({
    displayName: zod.string().trim().min(1, 'Display name is required').max(100, 'Display name cannot be more than 100 characters').optional(),
    exposed: zod.boolean().optional(),
    roomId: zod.string().min(1).max(100).nullable().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Nothing to update',
  });

export const adoptSensorSettingsSchema = zod.object({
  displayName: zod.string().trim().min(1).max(100).optional(),
  deviceName: zod.string().trim().min(1).max(100).optional(),
  roomId: zod.string().min(1).max(100).nullable().optional(),
  roomName: zod.string().trim().min(1).max(100).optional(),
  assignedCameraIds: zod.array(zod.string().min(1)).optional(),
  exposed: zod.boolean().optional(),
});

export const sensorCommandSchema = zod.object({
  property: zod.string().trim().min(1, 'Property is required'),
  value: zod.unknown(),
});

export const bulkDeleteSensorsSchema = zod.object({
  ids: zod.array(zod.string()).min(1).max(10000),
});

export type CreateVirtualSensorInput = zod.infer<typeof createVirtualSensorSchema>;
export type PatchSensorInput = zod.infer<typeof patchSensorSchema>;
export type PatchSensorDeviceInput = zod.infer<typeof patchSensorDeviceSchema>;
export type CreateSensorDeviceInput = zod.infer<typeof createSensorDeviceSchema>;
export type BulkDeleteSensorsInput = zod.infer<typeof bulkDeleteSensorsSchema>;
export type SensorCommandInput = zod.infer<typeof sensorCommandSchema>;
export type AdoptSensorSettings = zod.infer<typeof adoptSensorSettingsSchema>;
