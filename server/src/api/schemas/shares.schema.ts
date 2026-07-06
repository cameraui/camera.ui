import * as zod from 'zod';

export const createShareSchema = zod.object({
  cameraId: zod.string().min(1, 'Camera ID is required'),
  sourceId: zod.string().min(1, 'Source ID is required'),
  ttlHours: zod
    .number()
    .int()
    .min(1, 'Minimum 1 hour')
    .max(30 * 24, 'Maximum 720 hours'),
  maxViewers: zod.number().int().min(0, 'Minimum 0').optional(),
  label: zod.string().trim().optional(),
});

export const shareTokenParamsSchema = zod.object({
  token: zod.string().min(1, 'Token is required'),
});

export const sharesListQuerySchema = zod.object({
  camera: zod.string().optional(),
});

export const shareViewQuerySchema = zod.object({
  code: zod.string().trim(),
});

export type CreateShareInput = zod.output<typeof createShareSchema>;
export type ShareTokenParamsInput = zod.output<typeof shareTokenParamsSchema>;
export type SharesListQueryInput = zod.output<typeof sharesListQuerySchema>;
export type ShareViewQueryInput = zod.output<typeof shareViewQuerySchema>;
