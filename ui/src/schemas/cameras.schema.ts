import {
  createCameraBaseSchema as _createCameraBaseSchema,
  createCameraSchema as _createCameraSchema,
  alertZoneSchema,
  allowedSourceProtocols,
  detectionLineSchema,
  inputRoleSchema,
  motionZoneSchema,
  objectZoneSchema,
  patchCameraSchema,
  privacyZoneSchema,
  refineUniqueSourceNames,
} from '@shared/types';
import * as zod from 'zod';

import type { patchStorageSchema, previewCameraSchema } from '@shared/types';

const protocolRegex = new RegExp(`^(${allowedSourceProtocols.join('|')})`);

export const inputSourceUrlSchema = zod
  .string()
  .trim()
  .min(1, 'Camera Source is required')
  .regex(protocolRegex, 'Unsupported protocol — start the URL with a supported one (e.g. rtsp://)');

export const inputSchema = zod
  .object({
    name: zod.string().trim().min(1, 'Camera Source Name is required'),
    urls: inputSourceUrlSchema.array(),
    role: inputRoleSchema,
    useForSnapshot: zod.boolean().default(false),
    hotMode: zod.boolean().default(true),
    preload: zod.boolean().default(true),
    muted: zod.boolean().default(false),
    childSourceId: zod.string().trim().nullish(),
  })
  .strict()
  .transform((source) => (source.role === 'snapshot' ? { ...source, useForSnapshot: false, hotMode: false, preload: false } : source));

export const createCameraSchema = zod
  .object({
    ..._createCameraBaseSchema.shape,
    sources: inputSchema
      .array()
      .refine((sources) => sources.some((source) => source.role === 'high-resolution' || source.role === 'mid-resolution' || source.role === 'low-resolution'), {
        path: ['sources[].role'],
        message: 'One of the roles "high-resolution", "mid-resolution" or "low-resolution" is required',
      })
      .refine(
        (sources) => {
          const snapshotSources = sources.filter((source) => source.useForSnapshot);
          return snapshotSources.length <= 1;
        },
        {
          message: 'Only one source can be used for snapshot',
          path: ['sources'],
        },
      )
      .refine(
        (sources) => {
          const roles = sources.map((source) => source.role).filter(Boolean);
          return new Set(roles).size === roles.length;
        },
        {
          message: 'Each source role can be assigned to only one source',
          path: ['sources'],
        },
      )
      .superRefine(refineUniqueSourceNames),
  })
  .strict();

export const cameraCreateSchema = createCameraSchema;
export const cameraPatchSchema = patchCameraSchema;
export const cameraCreatePatchMotionZones = motionZoneSchema;
export const cameraCreatePatchObjectZones = objectZoneSchema;
export const cameraCreatePatchPrivacyZones = privacyZoneSchema;
export const cameraCreatePatchAlertZones = alertZoneSchema;
export const cameraCreatePatchLines = detectionLineSchema;

export type CreateCameraInput = zod.output<typeof _createCameraSchema>;
export type PreviewCameraInput = zod.output<typeof previewCameraSchema>;
export type PatchCameraInput = zod.output<typeof patchCameraSchema>;
export type PatchExtensionsInput = zod.output<typeof patchStorageSchema>;
export type CreatePatchCameraObjectZone = zod.output<typeof objectZoneSchema>;
export type CreatePatchCameraAlertZone = zod.output<typeof alertZoneSchema>;
export type CreatePatchCameraLine = zod.output<typeof detectionLineSchema>;
