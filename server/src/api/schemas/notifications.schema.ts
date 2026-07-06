import * as zod from 'zod';

export const notificationSettingsSchema = zod.object({
  enabled: zod.boolean(),
  sources: zod.record(zod.string(), zod.boolean()).optional(),
  systemTypes: zod.record(zod.string(), zod.boolean()).optional(),
  quietHours: zod
    .object({
      from: zod.string(),
      to: zod.string(),
      timezone: zod.string(),
    })
    .optional(),
});

export const registerDeviceSchema = zod.object({
  pluginName: zod.string().trim().min(1, 'Plugin name is required'),
  input: zod.record(zod.string(), zod.unknown()),
});

export const updateDeviceSchema = zod.object({
  name: zod.string().trim().min(1, 'Name is required').optional(),
  active: zod.boolean().optional(),
});

export const deviceParamsSchema = zod.object({
  id: zod.string().min(1, 'ID is required'),
});

export type NotificationSettingsInput = zod.output<typeof notificationSettingsSchema>;
export type RegisterDeviceInput = zod.output<typeof registerDeviceSchema>;
export type UpdateDeviceInput = zod.output<typeof updateDeviceSchema>;
export type DeviceParamsInput = zod.output<typeof deviceParamsSchema>;
