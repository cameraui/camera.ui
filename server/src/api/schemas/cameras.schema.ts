import { uuidv4 } from '@camera.ui/common/utils';
import * as zod from 'zod';

import { normalizeZones } from '../../camera/zones.js';

import type { CameraAspectRatio, DetectionLabel, VideoStreamingMode, ZoneLabel } from '@camera.ui/sdk';

export function hasCloudProtocol(urls: string[]): boolean {
  const cloudProtocols = ['kasa://', 'nest:', 'ring:', 'tapo://'];
  return urls.some((url) => cloudProtocols.some((protocol) => url.startsWith(protocol)));
}

export const recordingSettingsSchema = zod
  .object({
    enabled: zod.boolean().default(true),
    mode: zod.enum(['continuous', 'event', 'adhoc']).default('continuous'),
    preBuffer: zod.number().min(0).max(60).default(10),
    sources: zod.array(zod.enum(['high', 'mid', 'low'])).default(['high', 'mid', 'low']),
  })
  .strict();

export const DEFAULT_RECORDING_SETTINGS: zod.infer<typeof recordingSettingsSchema> = {
  enabled: true,
  mode: 'continuous',
  preBuffer: 10,
  sources: ['high', 'mid', 'low'],
};

export const notificationSettingsSchema = zod
  .object({
    enabled: zod.boolean().default(true),
    video: zod.boolean().default(false),
    audio: zod.string().trim().min(1).array().default([]),
    sensors: zod.string().trim().min(1).array().default([]),
    cooldown: zod.number().min(0).max(600).default(30),
    speed: zod.enum(['immediate', 'balanced', 'best']).default('balanced'),
  })
  .strict();

export const DEFAULT_NOTIFICATION_SETTINGS: zod.infer<typeof notificationSettingsSchema> = {
  enabled: true,
  video: false,
  audio: ['glass_break', 'scream', 'gunshot', 'alarm', 'siren', 'smoke_alarm'],
  sensors: ['doorbell', 'contact', 'siren', 'security_system', 'smoke', 'gas', 'carbonMonoxide', 'heat', 'leak', 'cold', 'vibration', 'tamper', 'problem'],
  cooldown: 30,
  speed: 'balanced',
};

export const detectionLabelSchema = zod.string().trim().min(1, 'Detection label is required') as zod.ZodType<DetectionLabel>;

export const zoneLabelSchema = zod.string().trim().min(1, 'Zone label is required') as zod.ZodType<ZoneLabel>;

export const pointsSchema = zod.tuple([zod.number(), zod.number()]);

const zoneColorSchema = zod
  .string()
  .trim()
  .regex(/^#([0-9A-Fa-f]{3}){1,2}$/, 'Must be a valid hex color (e.g. #FF0000 or #F00)')
  .default('#df2a4c');

export const motionZoneSchema = zod
  .object({
    name: zod.string().trim().min(1, 'Zone Name is required'),
    points: pointsSchema.array().min(3, 'At least 3 points are required'),
    color: zoneColorSchema,
  })
  .array();

export const objectZoneSchema = zod
  .object({
    name: zod.string().trim().min(1, 'Zone Name is required'),
    points: pointsSchema.array().min(3, 'At least 3 points are required'),
    type: zod.union([zod.literal('intersect'), zod.literal('contain')]).default('intersect'),
    labels: zoneLabelSchema.array(),
    color: zoneColorSchema,
  })
  .array();

export const privacyZoneSchema = zod
  .object({
    name: zod.string().trim().min(1, 'Zone Name is required'),
    points: pointsSchema.array().min(3, 'At least 3 points are required'),
    dropDetections: zod.boolean().default(true),
  })
  .array();

export const alertZoneSchema = zod
  .object({
    name: zod.string().trim().min(1, 'Zone Name is required'),
    points: pointsSchema.array().min(3, 'At least 3 points are required'),
    labels: detectionLabelSchema.array(),
    faces: zod.string().trim().min(1).array().optional(),
    plates: zod.string().trim().min(1).array().optional(),
    match: zod.union([zod.literal('anchor'), zod.literal('intersect'), zod.literal('contain')]).default('contain'),
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

export const zoneConfigSchema = zod
  .object({
    privacyFallback: zod.union([zod.literal('send'), zod.literal('drop')]).default('send'),
    motion: motionZoneSchema.default([]),
    object: objectZoneSchema.default([]),
    privacy: privacyZoneSchema.default([]),
    alert: alertZoneSchema.default([]),
    lines: detectionLineSchema.default([]),
  })
  .strict();

export const detectionSettingsSchema = zod.object({
  motion: zod.object({
    resolution: zod.union([zod.literal('low'), zod.literal('medium'), zod.literal('high')]),
    timeout: zod.number().min(10, 'Minimum 10 seconds'),
  }),
  object: zod.object({
    confidences: zod
      .object({
        person: zod.number().min(0.3, 'Minimum 0.3').max(1, 'Maximum 1').default(0.5),
        vehicle: zod.number().min(0.3, 'Minimum 0.3').max(1, 'Maximum 1').default(0.5),
        animal: zod.number().min(0.3, 'Minimum 0.3').max(1, 'Maximum 1').default(0.5),
      })
      .default({ person: 0.5, vehicle: 0.5, animal: 0.5 }),
    suppressStatic: zod.boolean().default(true),
    timeout: zod.number().min(10, 'Minimum 10 seconds').default(15),
  }),
  audio: zod.object({
    minDecibels: zod.number().min(-100, 'Minimum -100 dBFS').max(0, 'Maximum 0 dBFS'),
    timeout: zod.number().min(10, 'Minimum 10 seconds'),
    confidence: zod.number().min(0, 'Minimum 0').max(1, 'Maximum 1').default(0.7),
  }),
  face: zod
    .object({
      confidence: zod.number().min(0, 'Minimum 0').max(1, 'Maximum 1').default(0.5),
      matchThreshold: zod.number().min(0.3, 'Minimum 0.3').max(0.95, 'Maximum 0.95').default(0.55),
    })
    .default({ confidence: 0.5, matchThreshold: 0.55 }),
  licensePlate: zod
    .object({
      confidence: zod.number().min(0, 'Minimum 0').max(1, 'Maximum 1').default(0.3),
      ocrConfidence: zod.number().min(0, 'Minimum 0').max(1, 'Maximum 1').default(0.9),
      minLength: zod.number().int().min(1, 'Minimum 1').max(10, 'Maximum 10').default(4),
    })
    .default({ confidence: 0.3, ocrConfidence: 0.9, minLength: 4 }),
  sensor: zod.object({
    timeout: zod.number().min(10, 'Minimum 10 seconds'),
    triggers: zod.array(zod.string().trim().min(1, 'Sensor id is required')).default([]),
  }),
  cascadeDetection: zod.boolean().default(true),
  cascadeTimeout: zod.number().min(1, 'Minimum 1 second').max(300, 'Maximum 300 seconds').default(10),
  snooze: zod.boolean().default(false),
});

export const timeWindowSchema = zod.object({
  from: zod.string().regex(/^\d{1,2}:\d{2}$/, 'Use HH:mm'),
  to: zod.string().regex(/^\d{1,2}:\d{2}$/, 'Use HH:mm'),
  timezone: zod.string().trim().min(1, 'Timezone is required'),
});

export const DEFAULT_PTZ_AUTOTRACK_SETTINGS = {
  enabled: false,
  targetLabels: ['person'],
  minConfidence: 0.5,
  triggerDeadZone: 0.05,
  trackingSpeed: 2,
  leadMs: 1800,
  panRate: 0.85,
  returnToHome: false,
  homeWaitMs: 10000,
  minTargetSize: 0,
  maxTargetSize: 0,
};

export const ptzAutotrackSettingsSchema = zod.object({
  enabled: zod.boolean().default(false),
  targetLabels: zod.string().trim().min(1, 'Target label is required').array().default(['person']),
  minConfidence: zod.number().min(0.3, 'Minimum 0.3').max(1, 'Maximum 1').default(0.5),
  triggerDeadZone: zod.number().min(0, 'Minimum 0').max(0.3, 'Maximum 0.3').default(0.05),
  trackingSpeed: zod.number().min(1, 'Minimum 1').max(5, 'Maximum 5').default(2),
  leadMs: zod.number().min(0, 'Minimum 0').max(4000, 'Maximum 4000 ms').default(1800),
  panRate: zod.number().min(0.1, 'Minimum 0.1').max(3, 'Maximum 3').default(0.85),
  returnToHome: zod.boolean().default(false),
  homeWaitMs: zod.number().min(1000, 'Minimum 1000 ms').max(60000, 'Maximum 60000 ms').default(10000),
  minTargetSize: zod.number().min(0, 'Minimum 0').max(0.5, 'Maximum 0.5').default(0),
  maxTargetSize: zod.number().min(0, 'Minimum 0').max(1, 'Maximum 1').default(0),
  activeHours: timeWindowSchema.optional(),
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

export function refineUniqueSourceNames(sources: { name: string }[], ctx: zod.RefinementCtx): void {
  const seen = new Set<string>();
  sources.forEach((source, index) => {
    const key = source.name.replace(/ /g, '_').toLowerCase();
    if (seen.has(key)) {
      ctx.addIssue({ code: 'custom', message: 'Source name is already used by another source', path: [index, 'name'] });
    }
    seen.add(key);
  });
}

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
    backchannelDisabled: zod.boolean().default(false),
    timeout: zod.number().int().min(5).max(120).optional(),
    handshakeTimeout: zod.number().int().min(1).max(60).optional(),
    urls: urlSchema.array().min(1, 'At least one valid URL is required'),
    childSourceId: zod
      .string()
      .trim()
      .min(1, 'Child Source ID is required')
      .nullish()
      .transform((value) => value ?? undefined)
      .optional(),
  })
  .strict()
  .transform((source) => (source.role === 'snapshot' ? { ...source, useForSnapshot: false, hotMode: false, preload: false } : source));

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
    backchannelDisabled: zod.boolean().default(false),
    timeout: zod.number().int().min(5).max(120).optional(),
    handshakeTimeout: zod.number().int().min(1).max(60).optional(),
    urls: urlSchema.array().min(1, 'At least one valid URL is required'),
    childSourceId: zod
      .string()
      .trim()
      .min(1, 'Child Source ID is required')
      .nullish()
      .transform((value) => value ?? undefined)
      .optional(),
  })
  .strict()
  .transform((source) => (source.role === 'snapshot' ? { ...source, useForSnapshot: false, hotMode: false, preload: false } : source));

export const pluginInfo = zod.object({
  id: zod.string(),
  name: zod.string().trim(),
});

export const assignmentsSchema = zod
  .object({
    motion: pluginInfo.optional(),
    object: pluginInfo.optional(),
    objectAssist: pluginInfo.optional(),
    audio: pluginInfo.optional(),
    face: pluginInfo.optional(),
    licensePlate: pluginInfo.optional(),

    ptz: pluginInfo.optional(),
    battery: pluginInfo.optional(),
    cameraController: pluginInfo.optional(),
    clip: pluginInfo.optional(),

    classifier: pluginInfo.array().optional(),

    light: pluginInfo.array().optional(),
    siren: pluginInfo.array().optional(),
    switch: pluginInfo.array().optional(),
    securitySystem: pluginInfo.array().optional(),
    contact: pluginInfo.array().optional(),
    doorbell: pluginInfo.array().optional(),
    lock: pluginInfo.array().optional(),
    temperature: pluginInfo.array().optional(),
    humidity: pluginInfo.array().optional(),
    occupancy: pluginInfo.array().optional(),
    smoke: pluginInfo.array().optional(),
    leak: pluginInfo.array().optional(),
    garage: pluginInfo.array().optional(),
    gas: pluginInfo.array().optional(),
    carbonMonoxide: pluginInfo.array().optional(),
    carbonDioxide: pluginInfo.array().optional(),
    heat: pluginInfo.array().optional(),
    cold: pluginInfo.array().optional(),
    vibration: pluginInfo.array().optional(),
    tamper: pluginInfo.array().optional(),
    problem: pluginInfo.array().optional(),
    power: pluginInfo.array().optional(),
    illuminance: pluginInfo.array().optional(),

    hub: pluginInfo.array().optional(),
  })
  .strict();

export const streamingModeSchema: zod.ZodType<VideoStreamingMode> = zod.union([
  zod.literal('auto'),
  zod.literal('mse'),
  zod.literal('webrtc'),
  zod.literal('webrtc/tcp'),
]);

export const aspectRatioSchema: zod.ZodType<CameraAspectRatio> = zod
  .string()
  .regex(/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/, 'Use a width:height ratio, e.g. 16:9')
  .refine((value) => {
    const [w, h] = value.split(':').map(Number);
    return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
  }, 'Both sides must be greater than 0')
  .transform((value) => value as CameraAspectRatio);

export const frameWorkerDecoderSchema = zod
  .object({
    hardware: zod.enum(['auto', 'cpu', 'cuda', 'vaapi', 'qsv', 'videotoolbox', 'd3d11va', 'd3d12va', 'dxva2', 'vulkan', 'opencl', 'drm', 'rkmpp']).default('auto'),
    device: zod.string().trim().max(128).optional(),
  })
  .strict();

export const frameWorkerSettingsSchema = zod.object({
  mainStreamAnalysis: zod.boolean().default(false),
  decoder: frameWorkerDecoderSchema.optional(),
  workerDecoder: frameWorkerDecoderSchema
    .nullable()
    .transform((decoder) => decoder ?? undefined)
    .optional(),
});

export const cameraTypeSchema = zod.union([zod.literal('camera'), zod.literal('doorbell')]);

export const playbackSourceSchema = zod.union([zod.literal('auto'), zod.literal('high'), zod.literal('mid'), zod.literal('low')]);

export const activityModeSchema = zod.union([zod.literal('always-on'), zod.literal('activity'), zod.literal('standby')]);

export const interfaceSettingsSchema = zod.object({
  streamingMode: streamingModeSchema,
  streamingSource: streamingSourceRole,
  playbackSource: playbackSourceSchema.default('auto'),
  activityMode: activityModeSchema.default('always-on'),
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
    roomId: zod.string().trim().min(1).nullable().default(null),
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
          const roles = sources.map((source) => source.role).filter(Boolean);
          return new Set(roles).size === roles.length;
        },
        {
          message: 'Each source role can be assigned to only one source',
          path: ['sources'],
        },
      )
      .superRefine(refineUniqueSourceNames),
    plugins: pluginInfo.array().default([]),
    assignments: assignmentsSchema.default({}),
    interfaceSettings: interfaceSettingsSchema.default({
      streamingMode: 'webrtc',
      streamingSource: 'high-resolution',
      playbackSource: 'auto',
      activityMode: 'always-on',
      aspectRatio: '16:9',
    }),
    zones: zoneConfigSchema.default(normalizeZones()),
    detectionSettings: detectionSettingsSchema.default({
      motion: {
        resolution: 'low',
        timeout: 30,
      },
      object: {
        confidences: {
          person: 0.5,
          vehicle: 0.5,
          animal: 0.5,
        },
        suppressStatic: true,
        timeout: 15,
      },
      audio: {
        minDecibels: -40,
        timeout: 30,
        confidence: 0.7,
      },
      face: {
        confidence: 0.5,
        matchThreshold: 0.55,
      },
      licensePlate: {
        confidence: 0.3,
        ocrConfidence: 0.9,
        minLength: 4,
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
    recordingSettings: recordingSettingsSchema.default(DEFAULT_RECORDING_SETTINGS),
    notificationSettings: notificationSettingsSchema.default(DEFAULT_NOTIFICATION_SETTINGS),
    frameWorkerSettings: frameWorkerSettingsSchema.default({
      mainStreamAnalysis: false,
    }),
  })
  .strict();

export function defaultCameraSettings(): Omit<zod.output<typeof createCameraBaseSchema>, '_id' | 'name' | 'sources' | 'nativeId' | 'pluginInfo'> {
  const parsed = createCameraBaseSchema.parse({
    name: 'default',
    sources: [{ name: 'default', role: 'high-resolution', urls: ['rtsp://localhost'] }],
  });
  const { _id, name, sources, nativeId, pluginInfo, ...defaults } = parsed;
  return defaults;
}

export const createCameraSchema = createCameraBaseSchema.transform((data) => {
  const allUrls = data.sources.flatMap((source) => source.urls);

  if (data.isCloud || hasCloudProtocol(allUrls)) {
    return {
      ...data,
      isCloud: true,
    };
  }

  return {
    ...data,
  };
});

export const patchCameraSchema = zod
  .object({
    disabled: zod.boolean().optional(),
    type: cameraTypeSchema.optional(),
    name: zod.string().trim().min(1, 'Camera name is required').optional(),
    room: zod.string().trim().min(1, 'Room is required').optional(),
    roomId: zod.string().trim().min(1).nullable().optional(),
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
          const roles = sources.map((source) => source.role).filter(Boolean);
          return new Set(roles).size === roles.length;
        },
        {
          message: 'Each source role can be assigned to only one source',
          path: ['sources'],
        },
      )
      .superRefine(refineUniqueSourceNames)
      .optional(),
    plugins: pluginInfo.array().optional(),
    assignments: assignmentsSchema.partial().optional(),
    interfaceSettings: interfaceSettingsSchema.partial().optional(),
    zones: zoneConfigSchema.optional(),
    detectionSettings: detectionSettingsSchema.partial().optional(),
    ptzAutotrack: ptzAutotrackSettingsSchema.partial().optional(),
    recordingSettings: recordingSettingsSchema.partial().optional(),
    notificationSettings: notificationSettingsSchema.partial().optional(),
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

export const cameraSensorConfigParamsSchema = zod.object({
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

export const bulkPatchCamerasSchema = zod.object({
  cameranames: zod.array(zod.string().min(1)).min(1).max(1000),
  cameraData: zod
    .object({
      disabled: zod.boolean().optional(),
      detectionSettings: zod.object({ snooze: zod.boolean() }).optional(),
      recordingSettings: zod.object({ enabled: zod.boolean() }).optional(),
    })
    .refine((data) => data.disabled !== undefined || data.detectionSettings !== undefined || data.recordingSettings !== undefined, {
      message: 'Nothing to update',
    }),
});

export const bulkDeleteCamerasSchema = zod.object({
  cameranames: zod.array(zod.string().min(1)).min(1).max(1000),
});

export type PreviewCameraInput = zod.output<typeof previewCameraSchema>;
export type CreateCameraInput = zod.output<typeof createCameraSchema>;
export type PatchCameraInput = zod.output<typeof patchCameraSchema>;
export type BulkPatchCamerasInput = zod.output<typeof bulkPatchCamerasSchema>;
export type BulkDeleteCamerasInput = zod.output<typeof bulkDeleteCamerasSchema>;
export type SnapshotQueryInput = zod.output<typeof snapshotQuerySchema>;
export type ProbeQueryInput = zod.output<typeof probeQuerySchema>;
export type ExtensionTypeQueryInput = zod.output<typeof extensionTypeQuerySchema>;
export type ScopedSensorParamsInput = zod.output<typeof scopedSensorParamsSchema>;
export type SensorParamsInput = zod.output<typeof cameraSensorConfigParamsSchema>;
export type CameraPluginParamsInput = zod.output<typeof cameraPluginParamsSchema>;
export type ScopedPluginParamsInput = zod.output<typeof scopedPluginParamsSchema>;
export type StreamParamsInput = zod.output<typeof streamParamsSchema>;
export type CameraSourceParamsInput = zod.output<typeof cameraSourceParamsSchema>;
export type CameraParamsInput = zod.output<typeof cameraParamsSchema>;
