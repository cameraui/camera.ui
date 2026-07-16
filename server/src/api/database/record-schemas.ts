import { randomBytes, randomUUID } from 'node:crypto';
import * as zod from 'zod';

import { pointsSchema } from '../schemas/cameras.schema.js';
import {
  camviewViewSizeSchema,
  camviewViewTypeSchema,
  sensorShortcutTypeSchema,
  userLanguageSchema,
  userPreferencesCamviewViewsLayoutCameras,
} from '../schemas/users.schema.js';

const dbRolesSchema = zod.enum(['master', 'admin', 'user']);

const dbCamviewLayoutSchema = zod.object({
  _id: zod.string(),
  name: zod.string(),
  viewSize: camviewViewSizeSchema,
  cameras: userPreferencesCamviewViewsLayoutCameras.array().default([]),
  type: camviewViewTypeSchema,
});

const dbCameraShortcutSchema = zod.object({
  _id: zod.string(),
  type: zod.literal('camera'),
  cameraId: zod.string(),
  points: pointsSchema,
});

const dbSensorShortcutSchema = zod.object({
  _id: zod.string(),
  type: zod.literal('sensor'),
  sensorType: sensorShortcutTypeSchema,
  sensorName: zod.string(),
  sensorPluginId: zod.string(),
  sensorCameraId: zod.string(),
  points: pointsSchema,
});

const dbShortcutSchema = zod.discriminatedUnion('type', [dbCameraShortcutSchema, dbSensorShortcutSchema]);

export const dbUserSchema = zod.object({
  _id: zod.string(),
  avatar: zod.string().optional(),
  username: zod.string(),
  password: zod.string(),
  role: dbRolesSchema,
  firstLogin: zod.boolean().default(false),
  preferences: zod
    .object({
      language: userLanguageSchema.default('auto'),
      camview: zod.object({ views: dbCamviewLayoutSchema.array().default([]) }).default({ views: [] }),
      cameras: zod.record(zod.string(), zod.object({ shortcuts: dbShortcutSchema.array().default([]) })).default({}),
      discovery: zod
        .object({
          hiddenDevices: zod.object({ id: zod.string(), name: zod.string(), model: zod.string().optional() }).array().default([]),
        })
        .optional(),
    })
    .default({ language: 'auto', camview: { views: [] }, cameras: {} }),
  twoFactor: zod
    .object({
      enabled: zod.boolean(),
      secret: zod.string().optional(),
      backupCodes: zod.string().array().optional(),
      verifiedAt: zod.any().optional(),
    })
    .optional(),
});

export const dbInstanceSchema = zod.object({
  id: zod.string(),
  name: zod.string(),
  url: zod.string(),
  remoteHomeId: zod.string().optional(),
  credentials: zod
    .object({
      username: zod.string(),
      encryptedPassword: zod.string(),
      iv: zod.string(),
    })
    .optional(),
  tokenCache: zod
    .object({
      accessToken: zod.string(),
      refreshToken: zod.string(),
      cachedAt: zod.number(),
      user: zod
        .object({
          _id: zod.string(),
          username: zod.string(),
          role: dbRolesSchema,
          avatar: zod.string().optional(),
        })
        .optional(),
    })
    .optional(),
  favorite: zod.boolean().optional(),
  addedAt: zod.number(),
  addedBy: zod.string(),
  pending2fa: zod.number().optional(),
});

export const dbSettingsSchema = zod.object({
  version: zod.string(),
  instanceId: zod.string().default(() => randomUUID()),
  knownWorkers: zod.object({ agentId: zod.string(), name: zod.string(), lastSeen: zod.number() }).array().optional(),
  workerCredentials: zod.object({ agentId: zod.string(), name: zod.string(), user: zod.string(), secret: zod.string(), createdAt: zod.number() }).array().optional(),
  workerPairings: zod.object({ code: zod.string(), expiresAt: zod.number() }).array().optional(),
  backupScheduler: zod
    .object({
      enabled: zod.boolean().default(false),
      interval: zod.enum(['daily', 'weekly', 'monthly']).default('daily'),
      time: zod.string().default('03:00'),
      weekday: zod.number().default(0),
      dayOfMonth: zod.number().default(1),
      retention: zod.number().default(5),
      destinationPath: zod.string().default(''),
      lastRun: zod
        .object({
          timestamp: zod.number(),
          status: zod.enum(['success', 'error']),
          message: zod.string().optional(),
          filename: zod.string().optional(),
          durationMs: zod.number().optional(),
        })
        .optional(),
    })
    .optional(),
});

export const dbServerSchema = zod.object({
  serverAddresses: zod.string().array().default([]),
});

export const dbRemoteSchema = zod.object({
  enabled: zod.boolean().default(false),
  directEnabled: zod.boolean().default(false),
  directMode: zod.enum(['cloudflare', 'customDomain']).default('cloudflare'),
  customDomain: zod.object({ url: zod.string().nullable().default(null) }).default({ url: null }),
  cloudflare: zod
    .object({
      mode: zod.enum(['quick', 'token', 'managed']).default('quick'),
      hostname: zod.string().nullable().default(null),
      token: zod.string().nullable().default(null),
      tunnelId: zod.string().nullable().default(null),
    })
    .default({ mode: 'quick', hostname: null, token: null, tunnelId: null }),
});

export const dbMqttSchema = zod.object({
  enabled: zod.boolean().default(false),
  mode: zod.enum(['external', 'embedded']).default('external'),
  broker: zod
    .object({
      port: zod.number().default(1883),
      username: zod.string().nullable().default('cameraui'),
      password: zod
        .string()
        .nullable()
        .default(() => randomBytes(16).toString('hex')),
    })
    .default(() => ({ port: 1883, username: 'cameraui', password: randomBytes(16).toString('hex') })),
  host: zod.string().nullable().default(null),
  port: zod.number().default(1883),
  protocol: zod.enum(['mqtt', 'mqtts']).default('mqtt'),
  username: zod.string().nullable().default(null),
  password: zod.string().nullable().default(null),
  clientId: zod.string().default('cameraui'),
  topicPrefix: zod.string().default('cameraui'),
  tls: zod
    .object({
      rejectUnauthorized: zod.boolean().default(true),
      ca: zod.string().nullable().default(null),
      cert: zod.string().nullable().default(null),
      key: zod.string().nullable().default(null),
    })
    .default({ rejectUnauthorized: true, ca: null, cert: null, key: null }),
  haDiscovery: zod
    .object({
      enabled: zod.boolean().default(false),
      prefix: zod.string().default('homeassistant'),
    })
    .default({ enabled: false, prefix: 'homeassistant' }),
});

export const dbCloudSchema = zod.object({
  name: zod.string().optional(),
  oauth: zod
    .object({
      access_token: zod.string(),
      refresh_token: zod.string(),
      expires_at: zod.number(),
      scopes: zod.string().array(),
      grant_id: zod.string(),
      server_id: zod.string(),
      needs_reauth: zod.boolean().optional(),
    })
    .optional(),
  pending_pair: zod
    .object({
      device_code: zod.string(),
      user_code: zod.string(),
      interval: zod.number(),
      expires_at: zod.number(),
    })
    .optional(),
  push: zod.record(zod.string(), zod.unknown()).optional(),
  registrationId: zod.string().optional(),
});

export const dbInstancesConfigSchema = zod.object({
  homeId: zod.string(),
});
