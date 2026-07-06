import * as zod from 'zod';

import { uploadSchema } from '../utils/upload.js';

export const ACCEPTED_BACKUP_TYPES = ['application/gzip', 'application/x-gzip', 'application/x-tar'];
export const MAX_BACKUP_FILE_SIZE = 1024 * 1024 * 200;

const uiLocalStorageSchema = zod.looseObject({
  ui: zod.record(zod.string(), zod.unknown()).optional(),
  theme: zod.record(zod.string(), zod.unknown()).optional(),
  language: zod.string().optional(),
});

export const downloadBackupSchema = zod
  .object({
    localStorage: uiLocalStorageSchema.partial().optional(),
  })
  .strict();

export const restoreBackupSchema = zod.object({
  upload: uploadSchema(MAX_BACKUP_FILE_SIZE, ACCEPTED_BACKUP_TYPES, 'Max file size is 200MB', '.tar.* files are accepted'),
});

export const backupSchedulerSettingsSchema = zod
  .object({
    enabled: zod.boolean().default(false),
    interval: zod.union([zod.literal('daily'), zod.literal('weekly'), zod.literal('monthly')]).default('daily'),
    time: zod
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time, expected HH:mm')
      .default('03:00'),
    weekday: zod.number().int().min(0).max(6).default(0),
    dayOfMonth: zod.number().int().min(1).max(28).default(1),
    retention: zod.number().int().min(1, 'Minimum 1').max(60, 'Maximum 60').default(7),
    destinationPath: zod.string().trim().default(''),
  })
  .strict();

export const patchBackupSchedulerSettingsSchema = backupSchedulerSettingsSchema.partial().strict();

export const scheduledBackupParamsSchema = zod
  .object({
    filename: zod.string().regex(/^camera\.ui-backup-\d+\.tar\.gz$/, 'Invalid backup filename'),
  })
  .strict();

export type DownloadBackupInput = zod.output<typeof downloadBackupSchema>;
export type RestoreBackupInput = zod.output<typeof restoreBackupSchema>;
export type BackupSchedulerSettingsInput = zod.output<typeof backupSchedulerSettingsSchema>;
export type PatchBackupSchedulerSettingsInput = zod.output<typeof patchBackupSchedulerSettingsSchema>;
export type ScheduledBackupParamsInput = zod.output<typeof scheduledBackupParamsSchema>;
