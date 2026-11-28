import { uuidv4 } from '@camera.ui/common/utils';
import { SENSOR_META } from '@camera.ui/sdk';
import * as zod from 'zod';

import type { SensorMeta } from '@camera.ui/sdk';
import type { SensorShortcutType } from '../database/types.js';

import { uploadSchema } from '../utils/upload.js';
import { pointsSchema } from './cameras.schema.js';

export const LANGUAGES = [
  'ar',
  'bg',
  'bn',
  'ca',
  'cs',
  'da',
  'de',
  'el',
  'en',
  'es',
  'et',
  'fa',
  'fi',
  'fr',
  'he',
  'hi',
  'hr',
  'hu',
  'id',
  'it',
  'ja',
  'ko',
  'lt',
  'lv',
  'ms',
  'nb',
  'nl',
  'pl',
  'pt',
  'ro',
  'ru',
  'sk',
  'sl',
  'sr',
  'sv',
  'th',
  'tr',
  'uk',
  'ur',
  'vi',
  'zh',
] as const;

export const SUPPORTED_LANGUAGES = ['de', 'en'] as const satisfies readonly (typeof LANGUAGES)[number][];
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

export const camviewCardFitSchema = zod.enum(['aspect', 'contain', 'fill', 'cover']);

export const userPreferencesCamviewViewsLayout = zod.object({
  _id: zod
    .string()
    .default(uuidv4())
    .transform(() => uuidv4()),
  name: zod.string().trim().min(1, 'Layout name is required'),
  viewSize: camviewViewSizeSchema,
  cameras: userPreferencesCamviewViewsLayoutCameras.array(),
  type: camviewViewTypeSchema,
  cardFit: camviewCardFitSchema.optional(),
});

export const patchPreferencesCamviewViewsLayout = zod
  .object({
    name: zod.string().trim().min(1, 'Layout name is required'),
    viewSize: camviewViewSizeSchema,
    cameras: userPreferencesCamviewViewsLayoutCameras.array(),
    cardFit: camviewCardFitSchema,
  })
  .partial()
  .optional();

export const userPreferencesCamview = zod.object({
  views: userPreferencesCamviewViewsLayout.array(),
});

const shortcutTypeValues = (SENSOR_META as readonly SensorMeta[]).filter((meta) => meta.shortcutable).map((meta) => String(meta.type));
export const sensorShortcutTypeSchema = zod.enum(shortcutTypeValues as [SensorShortcutType, ...SensorShortcutType[]]);

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
  sensorId: zod.string(),
  sensorType: sensorShortcutTypeSchema,
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
    sensorId: zod.string(),
    sensorType: sensorShortcutTypeSchema,
    points: pointsSchema,
  })
  .partial();

export const patchPreferencesCameraShortcutLayout = zod.union([patchCameraShortcutSchema, patchSensorShortcutSchema]).optional();

export const userPreferencesCameras = zod.object({
  shortcuts: userPreferencesCameraShortcutLayout.array(),
  hiddenEventTypes: zod.string().array().optional(),
  shownEventTypes: zod.string().array().optional(),
});

const eventTypeList = zod.string().trim().min(1).max(64).array().max(64);

export const eventTypesByCameraSchema = zod.record(zod.string().trim().min(1), eventTypeList);

export const userLanguageSchema = zod.enum(['auto', ...SUPPORTED_LANGUAGES]);

const filterValues = zod.string().trim().min(1).max(128).array().max(1000);

export const userPreferencesRecordingsFilters = zod
  .object({
    contentKind: zod.enum(['all', 'events', 'episodes']),
    favoritesOnly: zod.boolean(),
    filterLogicTriggers: zod.enum(['and', 'or']),
    filterLogicAttributes: zod.enum(['and', 'or']),
    rooms: filterValues,
    cameraIds: filterValues,
    eventTypes: filterValues,
    audioLabels: filterValues,
    hasAttributes: filterValues,
    vehicleColors: filterValues,
    vehicleTypes: filterValues,
    sensorEvents: filterValues,
    gridRegions: zod.object({ col: zod.number(), row: zod.number(), w: zod.number(), h: zod.number() }).array().max(1000),
    minConfidence: zod.number().min(0).max(1),
    onlyWithRecordings: zod.boolean(),
  })
  .partial();

export const userPreferencesCameraRecordingsFilter = zod
  .object({
    types: filterValues,
    sensorEvents: filterValues,
    audioLabels: filterValues,
    vehicleColors: filterValues,
    vehicleTypes: filterValues,
    minConfidence: zod.number().min(0).max(1),
  })
  .partial();

export const userPreferencesRecordings = zod.object({
  ungrouped: zod.boolean().optional(),
  filters: userPreferencesRecordingsFilters.optional(),
  cameras: zod.record(zod.string().trim().min(1), userPreferencesCameraRecordingsFilter).optional(),
});

const timelineFilter = zod
  .object({
    hiddenTypes: eventTypeList,
    scope: zod.enum(['camera', 'all']),
    onlyMatches: zod.boolean(),
  })
  .partial();

export const userPreferencesTimeline = timelineFilter.extend({
  cameras: zod.record(zod.string().trim().min(1), timelineFilter).optional(),
});

export const HOME_BREAKPOINTS = ['xl', 'lg', 'md', 'sm'] as const;

export const HOME_WIDGET_KINDS = ['camera', 'sensor', 'notes', 'events', 'lights', 'automation', 'floorplan', 'group', 'clock', 'action'] as const;
export const HOME_ACTIONS = ['snooze', 'recording', 'mute', 'privacy'] as const;
export const HOME_CAMERA_FOLLOW = ['motion', 'detection'] as const;

export const HOME_DOCK_KEYS = ['light', 'climate', 'security', 'locks', 'openings', 'media', 'cameras'] as const;

export const HOME_ORIENTATIONS = ['portrait', 'landscape'] as const;

const homeWidgetPosition = zod.object({
  x: zod.number().int().min(0).max(15),
  y: zod.number().int().min(0).max(10_000),
  w: zod.number().int().min(1).max(16),
  h: zod.number().int().min(1).max(48),
});

const homeWindowSize = zod.number().int().min(0).max(20_000);

export const homeProfileSchema = zod.object({
  id: zod.string().trim().min(1).max(100),
  name: zod.string().trim().min(1).max(60).optional(),
  rule: zod
    .object({
      orientation: zod.enum(HOME_ORIENTATIONS),
      minWidth: homeWindowSize,
      maxWidth: homeWindowSize,
      minHeight: homeWindowSize,
      maxHeight: homeWindowSize,
    })
    .partial()
    .optional(),
  pages: zod
    .object({
      id: zod.string().trim().min(1).max(200),
      size: zod.enum(HOME_BREAKPOINTS).optional(),
      autoAdd: zod.boolean(),
      showDock: zod.boolean().optional(),
      widgets: zod
        .object({
          id: zod.string().trim().min(1).max(300),
          kind: zod.enum(HOME_WIDGET_KINDS),
          ref: zod.string().trim().min(1).max(200).optional(),
          layout: homeWidgetPosition.optional(),
          fit: camviewCardFitSchema.optional(),
          cameras: zod.string().trim().min(1).max(200).array().max(32).optional(),
          rotate: zod.number().int().min(5).max(3600).optional(),
          follow: zod.enum(HOME_CAMERA_FOLLOW).optional(),
          name: zod.string().trim().min(1).max(60).optional(),
          sensors: zod.string().trim().min(1).max(200).array().max(64).optional(),
          room: zod.string().trim().min(1).max(200).optional(),
          actions: zod.enum(HOME_ACTIONS).array().min(1).max(HOME_ACTIONS.length).optional(),
          minutes: zod.number().int().min(0).max(10_080).optional(),
        })
        .array()
        .max(500),
      hidden: zod.string().trim().min(1).max(300).array().max(2000),
    })
    .array()
    .max(200),
  dock: zod.enum(HOME_DOCK_KEYS).array().max(HOME_DOCK_KEYS.length).optional(),
  rooms: zod.string().trim().min(1).max(200).array().max(500).optional(),
  hiddenRooms: zod.string().trim().min(1).max(200).array().max(500).optional(),
});

export const userPreferencesHome = zod
  .object({
    hiddenCameras: zod.string().trim().min(1).array().max(1000),
    profiles: homeProfileSchema.array().max(20),
  })
  .partial();

const navLayoutOrder = zod
  .object({
    main: zod.string().array(),
    manage: zod.string().array(),
    system: zod.string().array(),
    settings: zod.string().array(),
  })
  .partial();

const navLayoutCollapsible = zod
  .object({
    main: zod.boolean(),
    manage: zod.boolean(),
    system: zod.boolean(),
    settings: zod.boolean(),
  })
  .partial();

export const userPreferencesNavLayout = zod.object({
  order: navLayoutOrder.optional(),
  collapsible: navLayoutCollapsible.optional(),
  settingsInNav: zod.boolean().optional(),
  hidden: zod.string().array().optional(),
});

export const userPreferences = zod.object({
  language: userLanguageSchema.optional(),
  camview: userPreferencesCamview,
  cameras: zod.record(zod.string().trim(), userPreferencesCameras),
  recordings: userPreferencesRecordings.optional(),
  home: userPreferencesHome.optional(),
  timeline: userPreferencesTimeline.optional(),
  navLayout: userPreferencesNavLayout.nullable().optional(),
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
    password: passwordSchema.optional(),
    passwordConfirm: zod.string().trim().optional(),
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
    kind: zod.enum(['native', 'web', 'tv']),
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
    currentPassword: zod.string().optional(),
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
export type EventTypesByCameraInput = zod.output<typeof eventTypesByCameraSchema>;
export type CameraShortcutParamsInput = zod.output<typeof cameraShortcutParamsSchema>;
export type CameraShortcutByIdParamsInput = zod.output<typeof cameraShortcutByIdParamsSchema>;
export type ViewParamsInput = zod.output<typeof viewParamsSchema>;
export type ViewsListParamsInput = zod.output<typeof viewsListParamsSchema>;
export type LanguageAbbreviations = (typeof LANGUAGES)[number];
export type SupportedLanguageAbbreviatons = (typeof SUPPORTED_LANGUAGES)[number];
export type UserLanguage = zod.output<typeof userLanguageSchema>;
