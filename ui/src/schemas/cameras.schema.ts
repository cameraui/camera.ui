import {
  allowedSourceProtocols,
  createCameraBaseSchema as _createCameraBaseSchema,
  createCameraSchema as _createCameraSchema,
  detectionLineSchema,
  detectionZoneSchema,
  inputRoleSchema,
  patchCameraSchema,
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
    childSourceId: zod.string().trim().optional(),
  })
  .strict();

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
          const snapshotSources = sources.filter((source) => source.role === 'snapshot');
          return snapshotSources.every((source) => !source.useForSnapshot);
        },
        {
          message: 'Snapshot source can not be used with useForSnapshot',
          path: ['sources'],
        },
      )
      .refine(
        (sources) => {
          const snapshotSources = sources.filter((source) => source.role === 'snapshot');
          return snapshotSources.every((source) => !source.hotMode);
        },
        {
          message: 'Snapshot source can not be used with hotMode',
        },
      )
      .refine(
        (sources) => {
          const snapshotSources = sources.filter((source) => source.role === 'snapshot');
          return snapshotSources.every((source) => !source.preload);
        },
        {
          message: 'Snapshot source can not be used with preload',
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
      ),
  })
  .strict();

export const cameraCreateSchema = createCameraSchema;
export const cameraPatchSchema = patchCameraSchema;
export const cameraCreatePatchZones = detectionZoneSchema;
export const cameraCreatePatchLines = detectionLineSchema;

export type CreateCameraInput = zod.output<typeof _createCameraSchema>;
export type PreviewCameraInput = zod.output<typeof previewCameraSchema>;
export type PatchCameraInput = zod.output<typeof patchCameraSchema>;
export type PatchExtensionsInput = zod.output<typeof patchStorageSchema>;
export type CreatePatchCameraZone = zod.output<typeof detectionZoneSchema>;
export type CreatePatchCameraLine = zod.output<typeof detectionLineSchema>;
