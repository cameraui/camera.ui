import * as zod from 'zod';

import { PLUGIN_IDENTIFIER_PATTERN } from '../../plugins/types.js';
import { uploadSchema } from '../utils/upload.js';
import { paginationQuerySchema } from './common.schema.js';

import type { AudioMetadata, ImageMetadata } from '@camera.ui/sdk';
import type { MultipartValue } from '@fastify/multipart';

export const ACCEPTED_OBJECT_IMAGE_TYPES = ['image/jpeg', 'image/png'];
export const MAX_OBJECT_FILE_SIZE = 1024 * 1024 * 2;

export const ACCEPTED_MOTION_VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
export const MAX_MOTION_FILE_SIZE = 1024 * 1024 * 10;

export const ACCEPTED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg'];
export const MAX_AUDIO_FILE_SIZE = 1024 * 1024 * 2;

type ConfigFormData = MultipartValue<string>;
type ImageMetadataFormData = MultipartValue<string>;
type AudioMetadataFormData = MultipartValue<string>;

const imageUploadSchema = () => uploadSchema(MAX_OBJECT_FILE_SIZE, ACCEPTED_OBJECT_IMAGE_TYPES, 'Max file size is 2 MB', '.jpeg and .png files are accepted');

const configFormSchema = zod.custom<ConfigFormData>().transform((config) => {
  return JSON.parse(config.value);
}) as unknown as zod.ZodType<Record<string, any>>;

const imageMetadataFormSchema = zod.custom<ImageMetadataFormData>().transform((metadata) => {
  return JSON.parse(metadata.value);
}) as unknown as zod.ZodType<ImageMetadata>;

const audioMetadataFormSchema = zod.custom<AudioMetadataFormData>().transform((metadata) => {
  return JSON.parse(metadata.value);
}) as unknown as zod.ZodType<AudioMetadata>;

export const installPluginSchema = zod
  .object({
    pluginname: zod
      .string()
      .trim()
      .refine((pluginname) => PLUGIN_IDENTIFIER_PATTERN.test(pluginname), 'Not a valid plugin name'),
    pluginversion: zod
      .string()
      .trim()
      .refine(
        (version) => /^[a-z][\w-]*$/i.test(version) || /^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/i.test(version),
        'Not a valid plugin version (expected a dist-tag or exact semver)',
      )
      .optional()
      .default('latest'),
  })
  .strict();

export const actionPluginSchema = zod
  .object({
    actionId: zod.string(),
    payload: zod.any(),
  })
  .strict();

export const patchPluginConfigJsonSchema = zod.record(zod.any(), zod.any());

export const testObjectDetectionSchema = zod.object({
  upload: imageUploadSchema(),
  metadata: imageMetadataFormSchema,
  config: configFormSchema,
});

export const testAudioDetectionSchema = zod.object({
  upload: uploadSchema(MAX_AUDIO_FILE_SIZE, ACCEPTED_AUDIO_TYPES, 'Max file size is 2 MB', '.mp3, .wav and .ogg files are accepted'),
  metadata: audioMetadataFormSchema,
  config: configFormSchema,
});

export const testMotionDetectionSchema = zod.object({
  upload: uploadSchema(MAX_MOTION_FILE_SIZE, ACCEPTED_MOTION_VIDEO_TYPES, 'Max file size is 5 MB', '.mp4 files are accepted'),
  config: configFormSchema,
});

export const testFaceDetectionSchema = zod.object({
  upload: imageUploadSchema(),
  metadata: imageMetadataFormSchema,
  config: configFormSchema,
});

export const testLicensePlateDetectionSchema = zod.object({
  upload: imageUploadSchema(),
  metadata: imageMetadataFormSchema,
  config: configFormSchema,
});

export const testClassifierDetectionSchema = zod.object({
  upload: imageUploadSchema(),
  metadata: imageMetadataFormSchema,
  config: configFormSchema,
});

export const pluginParamsSchema = zod.object({
  pluginname: zod.string(),
});

export const pluginScopedParamsSchema = zod.object({
  scope: zod.string(),
  pluginname: zod.string(),
});

export const searchQuerySchema = paginationQuerySchema.extend({
  pluginname: zod.string().trim().optional(),
  refresh: zod.coerce.boolean().optional(),
});

export const removeStorageQuerySchema = zod.object({
  removeStorage: zod.coerce.boolean().optional(),
});

export const pluginVersionQuerySchema = zod.object({
  pluginversion: zod.string().trim().optional(),
});

export type InstallPluginInput = zod.output<typeof installPluginSchema>;
export type ActionPluginInput = zod.output<typeof actionPluginSchema>;
export type PatchPluginConfigJsonInput = zod.output<typeof patchPluginConfigJsonSchema>;
export type TestObjectInput = zod.output<typeof testObjectDetectionSchema>;
export type TestMotionInput = zod.output<typeof testMotionDetectionSchema>;
export type TestAudioInput = zod.output<typeof testAudioDetectionSchema>;
export type TestFaceInput = zod.output<typeof testFaceDetectionSchema>;
export type TestLicensePlateInput = zod.output<typeof testLicensePlateDetectionSchema>;
export type TestClassifierInput = zod.output<typeof testClassifierDetectionSchema>;
export type PluginParamsInput = zod.output<typeof pluginParamsSchema>;
export type PluginScopedParamsInput = zod.output<typeof pluginScopedParamsSchema>;
export type SearchQueryInput = zod.output<typeof searchQuerySchema>;
export type RemoveStorageQueryInput = zod.output<typeof removeStorageQuerySchema>;
export type PluginVersionQueryInput = zod.output<typeof pluginVersionQuerySchema>;
