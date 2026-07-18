import * as zod from 'zod';

import { VIRTUAL_SENSOR_TYPES } from '../../camera/sensors/types.js';

import type { VirtualSensorType } from '../../camera/sensors/types.js';

export const createVirtualSensorSchema = zod.object({
  cameraId: zod.string().min(1, 'Camera ID is required'),
  type: zod.enum(VIRTUAL_SENSOR_TYPES as [VirtualSensorType, ...VirtualSensorType[]]),
  name: zod.string().trim().min(1, 'Name is required').max(100, 'Name cannot be more than 100 characters'),
});

export const patchVirtualSensorSchema = zod.object({
  displayName: zod.string().trim().min(1, 'Display name is required').max(100, 'Display name cannot be more than 100 characters'),
});

export const virtualSensorParamsSchema = zod.object({
  id: zod.string().min(1, 'ID is required'),
});

export type CreateVirtualSensorInput = zod.output<typeof createVirtualSensorSchema>;
export type PatchVirtualSensorInput = zod.output<typeof patchVirtualSensorSchema>;
export type VirtualSensorParamsInput = zod.output<typeof virtualSensorParamsSchema>;
