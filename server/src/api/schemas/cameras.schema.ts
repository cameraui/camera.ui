import { v4 as uuidv4 } from 'uuid';
import * as zod from 'zod';

import type { CameraAspectRatio, DetectionLabel, SensorType, VideoStreamingMode } from '@camera.ui/sdk';

export function hasCloudProtocol(urls: string[]): boolean {
  const cloudProtocols = ['kasa://', 'nest:', 'ring:', 'tapo://'];
  return urls.some((url) => cloudProtocols.some((protocol) => url.startsWith(protocol)));
}

const ZONE_COLORS = ['#df2a4c', '#2a7fdf', '#2adf7f', '#df7f2a', '#7f2adf', '#2adfdf', '#df2adf', '#7fdf2a'];

function getRandomZoneColor(): string {
  return ZONE_COLORS[Math.floor(Math.random() * ZONE_COLORS.length)];
}

function createDefaultDetectionZone() {
  return {
    name: 'Default Zone',
    points: [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ] as [number, number][],
    type: 'contain' as const,
    filter: 'include' as const,
    labels: ['motion', 'person', 'vehicle', 'animal'] as DetectionLabel[],
    isPrivacyMask: false,
    color: getRandomZoneColor(),
  };
}

export const recordingsSettingsSchema = zod
  .object({
    enabled: zod.boolean().default(false),
  })
  .strict();

export const detectionLabelSchema = zod.string().trim().min(1, 'Detection label is required') as zod.ZodType<DetectionLabel>;

export const pointsSchema = zod.tuple([zod.number(), zod.number()]);

export const detectionZoneSchema = zod
  .object({
    name: zod.string().trim().min(1, 'Zone Name is required'),
    points: pointsSchema.array().min(3, 'At least 3 points are required'),
    type: zod.union([zod.literal('intersect'), zod.literal('contain')]),
    filter: zod.union([zod.literal('include'), zod.literal('exclude')]),
    labels: detectionLabelSchema.array(),
    isPrivacyMask: zod.boolean(),
    color: zod
      .string()
      .trim()
      .regex(/^#([0-9A-Fa-f]{3}){1,2}$/, 'Must be a valid hex color (e.g. #FF0000 or #F00)')
      .default('#df2a4c'),
  })
  .array();

export const detectionLineSchema = zod
  .object({
    name: zod.string().trim().min(1, 'Line Name is required'),
    points: zod.tuple([pointsSchema, pointsSchema]),
    direction: zod.union([zod.literal('both'), zod.literal('a-to-b'), zod.literal('b-to-a')]),
    labels: detectionLabelSchema.array(),
    color: zod
      .string()
      .trim()
      .regex(/^#([0-9A-Fa-f]{3}){1,2}$/, 'Must be a valid hex color (e.g. #FF0000 or #F00)')
      .default('#df2a4c'),
  })
  .array();

export const detectionSettingsSchema = zod.object({
  motion: zod.object({
    resolution: zod.union([zod.literal('low'), zod.literal('medium'), zod.literal('high')]),
    timeout: zod.number().min(10, 'Minimum 10 seconds'),
  }),
  object: zod.object({
    confidence: zod.number().min(0.3, 'Minimum 0.3').max(1, 'Maximum 1'),
    suppressStatic: zod.boolean().default(true),
  }),
  audio: zod.object({
    minDecibels: zod.number().min(-100, 'Minimum -100 dBFS').max(0, 'Maximum 0 dBFS'),
    timeout: zod.number().min(10, 'Minimum 10 seconds'),
  }),
  sensor: zod.object({
    timeout: zod.number().min(10, 'Minimum 10 seconds'),
    triggers: zod
      .array(
        zod.object({
          sensorType: zod.string().trim().min(1, 'Sensor type is required') as zod.ZodType<SensorType>,
          sensorName: zod.string().trim().min(1, 'Sensor name is required'),
          pluginId: zod.string().trim().min(1, 'Plugin ID is required'),
        }),
      )
      .default([]),
  }),
  cascadeDetection: zod.boolean().default(true),
  cascadeTimeout: zod.number().min(1, 'Minimum 1 second').max(300, 'Maximum 300 seconds').default(10),
  snooze: zod.boolean().default(false),
});

export const DEFAULT_PTZ_AUTOTRACK_SETTINGS = {
  enabled: false,
  targetLabels: ['person'],
  minConfidence: 0.5,
  triggerDeadZone: 0.05,
  trackingSpeed: 2,
  leadFrames: 3,
  panRate: 0.85,
  returnToHome: false,
  homeWaitMs: 10000,
};

export const ptzAutotrackSettingsSchema = zod.object({
  enabled: zod.boolean().default(false),
  targetLabels: zod.string().trim().min(1, 'Target label is required').array().default(['person']),
  minConfidence: zod.number().min(0.3, 'Minimum 0.3').max(1, 'Maximum 1').default(0.5),
  triggerDeadZone: zod.number().min(0, 'Minimum 0').max(0.3, 'Maximum 0.3').default(0.05),
  trackingSpeed: zod.number().min(1, 'Minimum 1').max(5, 'Maximum 5').default(2),
  leadFrames: zod.number().min(0, 'Minimum 0').max(6, 'Maximum 6').default(3),
  panRate: zod.number().min(0.1, 'Minimum 0.1').max(3, 'Maximum 3').default(0.85),
  returnToHome: zod.boolean().default(false),
  homeWaitMs: zod.number().min(1000, 'Minimum 1000 ms').max(60000, 'Maximum 60000 ms').default(10000),
});

export const inputRoleSchema = zod.union([zod.literal('high-resolution'), zod.literal('mid-resolution'), zod.literal('low-resolution'), zod.literal('snapshot')]);

export const streamingSourceRole = zod.union([zod.literal('high-resolution'), zod.literal('mid-resolution'), zod.literal('low-resolution')]);

export const inputProtocolSchema = zod.union([
  zod.literal('bubble://'),
  zod.literal('cui://'),
  zod.literal('doorbird://'),
  zod.literal('dvrip://'),
  // zod.literal('echo:'),
  zod.literal('eseecloud://'),
  // zod.literal('exec:'),
  // zod.literal('expr:'),
  zod.literal('ffmpeg:'),
  zod.literal('flussonic://'),
  zod.literal('gopro://'),
  zod.literal('hass:'),
  zod.literal('homekit://'),
  zod.literal('http://'),
  zod.literal('https://'),
  zod.literal('httpx://'),
  zod.literal('isapi://'),
  zod.literal('ivideon:'),
  zod.literal('kasa://'),
  zod.literal('nest:'),
  zod.literal('onvif://'),
  zod.literal('ring:'),
  zod.literal('roborock://'),
  zod.literal('rtmp://'),
  zod.literal('rtsp://'),
  zod.literal('rtspx://'),
  zod.literal('tapo://'),
  zod.literal('tcp://'),
  zod.literal('tuya://'),
  zod.literal('xiaomi://'),
  zod.literal('yandex:'),
  zod.literal('webrtc:'),
  zod.literal('webtorrent:'),
  zod.literal('wyze://'),
]);

// Allowlist of source protocols accepted from user input. echo:/exec:/expr: are
// intentionally excluded above — they can execute arbitrary commands.
export const allowedSourceProtocols = inputProtocolSchema.options.map((option) => option.value);
const protocolRegex = new RegExp(`^(${allowedSourceProtocols.join('|')})`);

const urlSchema = zod.string().refine(
  (val) => {
    if (!protocolRegex.test(val)) return false;

    try {
      new URL(val);
      return true;
    } catch {
      return false;
    }
  },
  {
    message: 'Invalid URL format or unsupported protocol',
  },
);

export const inputSchema = zod
  .object({
    _id: zod
      .string()
      .default(uuidv4())
      .transform(() => uuidv4()),
    name: zod
      .string()
      .trim()
      .min(1, 'Camera Source Name is required')
      .transform((val) => val.replace(/ /g, '_').toLowerCase()),
    role: inputRoleSchema,
    useForSnapshot: zod.boolean().default(false),
    hotMode: zod.boolean().default(true),
    preload: zod.boolean().default(true),
    muted: zod.boolean().default(false),
    urls: urlSchema.array().min(1, 'At least one valid URL is required'),
    childSourceId: zod.string().trim().min(1, 'Child Source ID is required').optional(),
  })
  .strict();

export const patchInputSchema = zod
  .object({
    _id: zod
      .string()
      .default(uuidv4())
      .transform(() => uuidv4()),
    name: zod
      .string()
      .trim()
      .min(1, 'Camera Source Name is required')
      .transform((val) => val.replace(/ /g, '_').toLowerCase()),
    role: inputRoleSchema,
    useForSnapshot: zod.boolean().default(false),
    hotMode: zod.boolean().default(true),
    preload: zod.boolean().default(true),
    muted: zod.boolean().default(false),
    urls: urlSchema.array().min(1, 'At least one valid URL is required'),
    childSourceId: zod.string().trim().min(1, 'Child Source ID is required').optional(),
  })
  .strict();

export const pluginInfo = zod.object({
  id: zod.string(),
  name: zod.string().trim(),
});

export const assignmentsSchema = zod
  .object({
    motion: pluginInfo.optional(),
    object: pluginInfo.optional(),
    audio: pluginInfo.optional(),
    face: pluginInfo.optional(),
    licensePlate: pluginInfo.optional(),

    ptz: pluginInfo.optional(),
    battery: pluginInfo.optional(),
    cameraController: pluginInfo.optional(),

    // classifiers like bird classifier, dog breed, etc.
    classifier: pluginInfo.array().optional(),

    light: pluginInfo.array().optional(),
    siren: pluginInfo.array().optional(),
    switch: pluginInfo.array().optional(),
    securitySystem: pluginInfo.array().optional(),
    contact: pluginInfo.array().optional(),
    doorbell: pluginInfo.array().optional(),

    hub: pluginInfo.array().optional(),
  })
  .strict();

export const streamingModeSchema: zod.ZodType<VideoStreamingMode> = zod.union([
  zod.literal('auto'),
  zod.literal('mse'),
  zod.literal('webrtc'),
  zod.literal('webrtc/tcp'),
]);

export const aspectRatioSchema: zod.ZodType<CameraAspectRatio> = zod.union([
  zod.literal('16:9'),
  zod.literal('9:16'),
  zod.literal('8:3'),
  zod.literal('4:3'),
  zod.literal('1:1'),
]);

export const frameWorkerSettingsSchema = zod.object({
  fps: zod.number().min(0, 'Minimum 0 fps').max(30, 'Maximum 30 fps'),
  hqSnapshots: zod.boolean().default(false),
});

export const cameraTypeSchema = zod.union([zod.literal('camera'), zod.literal('doorbell')]);

export const interfaceSettingsSchema = zod.object({
  streamingMode: streamingModeSchema,
  streamingSource: streamingSourceRole,
  aspectRatio: aspectRatioSchema,
});

export const cameraInfoSchema = zod.object({
  model: zod.string().trim().optional(),
  manufacturer: zod.string().trim().optional(),
  hardware: zod.string().trim().optional(),
  serialNumber: zod.string().trim().optional(),
  firmwareVersion: zod.string().trim().optional(),
  supportUrl: zod.string().trim().optional(),
});

export const cameraPluginInfo = zod
  .object({
    id: zod.string(),
    name: zod.string().trim(),
  })
  .strict();

export const snapshotSettingsSchema = zod
  .object({
    autoRefresh: zod.boolean().default(true),
    ttl: zod.number().min(10, 'Minimum 10 seconds').max(60, 'Maximum 60 seconds').default(50),
    interval: zod.number().min(10, 'Minimum 10 seconds').max(60, 'Maximum 60 seconds').default(60),
  })
  .strict();

export const createCameraBaseSchema = zod
  .object({
    _id: zod
      .string()
      .default(uuidv4())
      .transform(() => uuidv4()),
    nativeId: zod.string().trim().optional(),
    pluginInfo: cameraPluginInfo.optional(),
    disabled: zod.boolean().default(false),
    name: zod.string().trim().min(1, 'Camera name is required'),
    room: zod.string().trim().min(1, 'Room is required').default('Default'),
    type: cameraTypeSchema.default('camera'),
    isCloud: zod.boolean().default(false),
    snapshotSettings: snapshotSettingsSchema.default({
      autoRefresh: true,
      ttl: 50,
      interval: 60,
    }),
    info: cameraInfoSchema.default({
      model: 'IP Camera',
      manufacturer: 'camera.ui',
      hardware: 'Camera',
      serialNumber: 'Unknown',
      firmwareVersion: 'Unknown',
      supportUrl: 'Unknown',
    }),
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
    plugins: pluginInfo.array().default([]),
    assignments: assignmentsSchema.default({}),
    interfaceSettings: interfaceSettingsSchema.default({
      streamingMode: 'webrtc',
      streamingSource: 'high-resolution',
      aspectRatio: '16:9',
    }),
    detectionZones: detectionZoneSchema.default([]),
    detectionLines: detectionLineSchema.default([]),
    detectionSettings: detectionSettingsSchema.default({
      motion: {
        resolution: 'low',
        timeout: 30,
      },
      object: {
        confidence: 0.5,
        suppressStatic: true,
      },
      audio: {
        minDecibels: -40,
        timeout: 30,
      },
      sensor: {
        timeout: 30,
        triggers: [],
      },
      cascadeDetection: true,
      cascadeTimeout: 10,
      snooze: false,
    }),
    ptzAutotrack: ptzAutotrackSettingsSchema.default(DEFAULT_PTZ_AUTOTRACK_SETTINGS),
    frameWorkerSettings: frameWorkerSettingsSchema.default({
      fps: 10,
      hqSnapshots: false,
    }),
  })
  .strict();

export const createCameraSchema = createCameraBaseSchema.transform((data) => {
  const allUrls = data.sources.flatMap((source) => source.urls);

  const detectionZones = data.detectionZones.length === 0 ? [createDefaultDetectionZone()] : data.detectionZones;

  if (data.isCloud || hasCloudProtocol(allUrls)) {
    return {
      ...data,
      isCloud: true,
      detectionZones,
    };
  }

  return {
    ...data,
    detectionZones,
  };
});

export const patchCameraSchema = zod
  .object({
    disabled: zod.boolean().optional(),
    type: cameraTypeSchema.optional(),
    name: zod.string().trim().min(1, 'Camera name is required').optional(),
    room: zod.string().trim().min(1, 'Room is required').optional(),
    isCloud: zod.boolean().optional(),
    snapshotSettings: snapshotSettingsSchema.partial().optional(),
    info: cameraInfoSchema.partial().optional(),
    sources: patchInputSchema
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
      )
      .optional(),
    plugins: pluginInfo.array().optional(),
    assignments: assignmentsSchema.partial().optional(),
    interfaceSettings: interfaceSettingsSchema.partial().optional(),
    detectionZones: detectionZoneSchema.optional(),
    detectionLines: detectionLineSchema.optional(),
    detectionSettings: detectionSettingsSchema.partial().optional(),
    ptzAutotrack: ptzAutotrackSettingsSchema.partial().optional(),
    frameWorkerSettings: frameWorkerSettingsSchema.partial().optional(),
  })
  .strict()
  .transform((data) => {
    if (data.sources) {
      const allUrls = data.sources.flatMap((source) => source.urls);

      if (data.isCloud === true || hasCloudProtocol(allUrls)) {
        return {
          ...data,
          isCloud: true,
        };
      }
    }

    return data;
  });

export const previewCameraSchema = zod
  .object({
    url: zod
      .string()
      .trim()
      .refine((v) => !/^\s*(exec|echo|expr):/i.test(v), 'Command-execution stream sources are not allowed'),
  })
  .strict();

export const cameraParamsSchema = zod.object({
  cameraname: zod.string(),
});

export const cameraSourceParamsSchema = zod.object({
  cameraname: zod.string(),
  sourcename: zod.string(),
});

export const streamParamsSchema = zod.object({
  cameraid: zod.string(),
  sourcename: zod.string(),
});

export const cameraPluginParamsSchema = zod.object({
  cameraname: zod.string(),
  pluginname: zod.string(),
});

export const scopedPluginParamsSchema = zod.object({
  cameraname: zod.string(),
  scope: zod.string(),
  pluginname: zod.string(),
});

export const sensorParamsSchema = zod.object({
  cameraname: zod.string(),
  pluginname: zod.string(),
  sensorId: zod.string(),
});

export const scopedSensorParamsSchema = zod.object({
  cameraname: zod.string(),
  scope: zod.string(),
  pluginname: zod.string(),
  sensorId: zod.string(),
});

export const extensionTypeQuerySchema = zod.object({
  type: zod.string().optional(),
});

export const probeQuerySchema = zod.object({
  video: zod.coerce.boolean().optional(),
  audio: zod.coerce.boolean().optional(),
  microphone: zod.coerce.boolean().optional(),
  refresh: zod.coerce.boolean().optional(),
});

export const snapshotQuerySchema = zod.object({
  forceNew: zod.coerce.boolean().optional(),
});

export type PreviewCameraInput = zod.output<typeof previewCameraSchema>;
export type CreateCameraInput = zod.output<typeof createCameraSchema>;
export type PatchCameraInput = zod.output<typeof patchCameraSchema>;
export type SnapshotQueryInput = zod.output<typeof snapshotQuerySchema>;
export type ProbeQueryInput = zod.output<typeof probeQuerySchema>;
export type ExtensionTypeQueryInput = zod.output<typeof extensionTypeQuerySchema>;
export type ScopedSensorParamsInput = zod.output<typeof scopedSensorParamsSchema>;
export type SensorParamsInput = zod.output<typeof sensorParamsSchema>;
export type CameraPluginParamsInput = zod.output<typeof cameraPluginParamsSchema>;
export type ScopedPluginParamsInput = zod.output<typeof scopedPluginParamsSchema>;
export type StreamParamsInput = zod.output<typeof streamParamsSchema>;
export type CameraSourceParamsInput = zod.output<typeof cameraSourceParamsSchema>;
export type CameraParamsInput = zod.output<typeof cameraParamsSchema>;
