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

export const NOTIFICATION_FILTERS = ['all', 'unread', 'problems', 'cameras', 'plugins', 'system', 'automations'] as const;

export const notificationListQuerySchema = zod.object({
  cursor: zod.string().max(100).optional(),
  limit: zod.coerce.number().int().min(1).max(100).default(50),
  filter: zod.enum(NOTIFICATION_FILTERS).default('all'),
  q: zod.string().trim().max(200).optional(),
  source: zod.string().min(1).max(100).optional(),
});

export const notificationIdsSchema = zod.object({
  ids: zod.array(zod.string().min(1).max(100)).min(1).max(10_000),
});

export type NotificationSettingsInput = zod.output<typeof notificationSettingsSchema>;
export type RegisterDeviceInput = zod.output<typeof registerDeviceSchema>;
export type UpdateDeviceInput = zod.output<typeof updateDeviceSchema>;
export type DeviceParamsInput = zod.output<typeof deviceParamsSchema>;
export type NotificationListQueryInput = zod.output<typeof notificationListQuerySchema>;
export type NotificationIdsInput = zod.output<typeof notificationIdsSchema>;
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];
