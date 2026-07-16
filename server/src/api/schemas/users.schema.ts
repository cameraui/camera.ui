import { uuidv4 } from '@camera.ui/common/utils';
import * as zod from 'zod';

import { uploadSchema } from '../utils/upload.js';
import { pointsSchema } from './cameras.schema.js';

export const SUPPORTED_LANGUAGES = ['de', 'en'] as const;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
export const MAX_IMAGE_FILE_SIZE = 1024 * 1024 * 5;

export const userPreferencesCamviewViewsLayoutCameras = zod.object({
  index: zod.number(),
  cameraId: zod.string(),
  colSpan: zod.number().optional(),
  rowSpan: zod.number().optional(),
  x: zod.number().optional(),
  y: zod.number().optional(),
});

export const camviewViewSizeSchema = zod.union([
  zod.literal(1),
  zod.literal(4),
  zod.literal(6),
  zod.literal(7),
  zod.literal(9),
  zod.literal(10),
  zod.literal(12),
  zod.literal(13),
  zod.literal(15),
  zod.literal(16),
  zod.literal(20),
  zod.literal(26),
]);

export const camviewViewTypeSchema = zod.union([zod.literal('dnd'), zod.literal('view')]);

export const userPreferencesCamviewViewsLayout = zod.object({
  _id: zod
    .string()
    .default(uuidv4())
    .transform(() => uuidv4()),
  name: zod.string().trim().min(1, 'Layout name is required'),
  viewSize: camviewViewSizeSchema,
  cameras: userPreferencesCamviewViewsLayoutCameras.array(),
  type: camviewViewTypeSchema,
});

export const patchPreferencesCamviewViewsLayout = zod
  .object({
    name: zod.string().trim().min(1, 'Layout name is required'),
    viewSize: camviewViewSizeSchema,
    cameras: userPreferencesCamviewViewsLayoutCameras.array(),
  })
  .partial()
  .optional();

export const userPreferencesCamview = zod.object({
  views: userPreferencesCamviewViewsLayout.array(),
});

export const sensorShortcutTypeSchema = zod.enum([
  'contact',
  'temperature',
  'humidity',
  'occupancy',
  'smoke',
  'leak',
  'light',
  'siren',
  'switch',
  'lock',
  'garage',
  'doorbell',
  'securitySystem',
  'battery',
]);

const cameraShortcutSchema = zod.object({
  _id: zod
    .string()
    .default(uuidv4())
    .transform(() => uuidv4()),
  type: zod.literal('camera'),
  cameraId: zod.string(),
  points: pointsSchema,
});

const sensorShortcutSchema = zod.object({
  _id: zod
    .string()
    .default(uuidv4())
    .transform(() => uuidv4()),
  type: zod.literal('sensor'),
  sensorType: sensorShortcutTypeSchema,
  sensorName: zod.string(),
  sensorPluginId: zod.string(),
  sensorCameraId: zod.string(),
  points: pointsSchema,
});

export const userPreferencesCameraShortcutLayout = zod.discriminatedUnion('type', [cameraShortcutSchema, sensorShortcutSchema]);

const patchCameraShortcutSchema = zod
  .object({
    type: zod.literal('camera'),
    cameraId: zod.string(),
    points: pointsSchema,
  })
  .partial();

const patchSensorShortcutSchema = zod
  .object({
    type: zod.literal('sensor'),
    sensorType: sensorShortcutTypeSchema,
    sensorName: zod.string(),
    sensorPluginId: zod.string(),
    sensorCameraId: zod.string(),
    points: pointsSchema,
  })
  .partial();

export const patchPreferencesCameraShortcutLayout = zod.union([patchCameraShortcutSchema, patchSensorShortcutSchema]).optional();

export const userPreferencesCameras = zod.object({
  shortcuts: userPreferencesCameraShortcutLayout.array(),
});

export const userLanguageSchema = zod.enum(['auto', ...SUPPORTED_LANGUAGES]);

export const userPreferences = zod.object({
  language: userLanguageSchema.optional(),
  camview: userPreferencesCamview,
  cameras: zod.record(zod.string().trim(), userPreferencesCameras),
});

export const passwordSchema = zod
  .string()
  .trim()
  .min(10, 'Password must be at least 10 characters long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/, 'Password must contain at least one special character (!@#$%^&*()_+-=[]{};:\'"\\|,.<>/?)')
  .max(32, 'Password cannot be more than 32 characters');

export const createUserSchema = zod
  .object({
    _id: zod
      .string()
      .default(uuidv4())
      .transform(() => uuidv4()),
    username: zod.string().trim().min(1, 'Username is required'),
    password: passwordSchema,
    passwordConfirm: zod.string().trim().min(1, 'Please confirm your password'),
    role: zod.union([zod.literal('admin'), zod.literal('user')]),
    firstLogin: zod.boolean().default(true),
    preferences: userPreferences.default({
      language: 'auto',
      camview: {
        views: [],
      },
      cameras: {},
    }),
  })
  .strict()
  .refine((data) => data.password === data.passwordConfirm, {
    path: ['passwordConfirm'],
    message: 'Passwords do not match',
  });

export const loginUserSchema = zod
  .object({
    username: zod.string().trim().min(1, 'Username is required'),
    password: zod.string().trim().min(1, 'Password is required'),
    kind: zod.enum(['native', 'web']),
    persistent: zod.boolean().default(false),
    device: zod.object({
      id: zod.string().min(1, 'Device id is required').max(128, 'Device id cannot be more than 128 characters'),
      name: zod.string().trim().min(1, 'Device name is required').max(100, 'Device name cannot be more than 100 characters'),
    }),
  })
  .strict();

export const patchUserSchema = zod
  .object({
    username: zod.string().trim().min(1, 'Username is required').optional(),
    password: passwordSchema.optional(),
    passwordConfirm: zod.string().trim().optional(),
    role: zod.union([zod.literal('admin'), zod.literal('user')]).optional(),
    upload: zod.optional(uploadSchema(MAX_IMAGE_FILE_SIZE, ACCEPTED_IMAGE_TYPES, 'Max file size is 5MB.', '.jpg, .jpeg, .png files are accepted.')),
    firstLogin: zod.boolean().optional(),
    preferences: userPreferences.partial().optional(),
  })
  .strict()
  .refine((data) => data.password === data.passwordConfirm, {
    path: ['passwordConfirm'],
    message: 'Passwords do not match',
  });

export const usernameParamsSchema = zod.object({
  username: zod.string(),
});

export const cameraShortcutParamsSchema = zod.object({
  username: zod.string(),
  cameraname: zod.string(),
});

export const cameraShortcutByIdParamsSchema = zod.object({
  username: zod.string(),
  cameraname: zod.string(),
  shortcutid: zod.string(),
});

export const viewParamsSchema = zod.object({
  username: zod.string(),
  viewid: zod.string(),
});

export const viewsListParamsSchema = zod.object({
  username: zod.string(),
});

export type CreateUserInput = zod.output<typeof createUserSchema>;
export type LoginUserInput = zod.output<typeof loginUserSchema>;
export type PatchUserInput = zod.output<typeof patchUserSchema>;
export type CreateViewInput = zod.output<typeof userPreferencesCamviewViewsLayout>;
export type PatchViewInput = zod.output<typeof patchPreferencesCamviewViewsLayout>;
export type CreateShortcutInput = zod.output<typeof userPreferencesCameraShortcutLayout>;
export type PatchShortcutInput = zod.output<typeof patchPreferencesCameraShortcutLayout>;
export type UsernameParamsInput = zod.output<typeof usernameParamsSchema>;
export type CameraShortcutParamsInput = zod.output<typeof cameraShortcutParamsSchema>;
export type CameraShortcutByIdParamsInput = zod.output<typeof cameraShortcutByIdParamsSchema>;
export type ViewParamsInput = zod.output<typeof viewParamsSchema>;
export type ViewsListParamsInput = zod.output<typeof viewsListParamsSchema>;
export type SupportedLanguageAbbreviatons = (typeof SUPPORTED_LANGUAGES)[number];
export type UserLanguage = zod.output<typeof userLanguageSchema>;
