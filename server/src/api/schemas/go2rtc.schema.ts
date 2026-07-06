import * as zod from 'zod';

import {
  DEFAULT_GO2RTC_CONFIG_API,
  DEFAULT_GO2RTC_CONFIG_FFMPEG,
  DEFAULT_GO2RTC_CONFIG_LOGGER,
  DEFAULT_GO2RTC_CONFIG_RTMP,
  DEFAULT_GO2RTC_CONFIG_RTSP,
  DEFAULT_GO2RTC_CONFIG_SRTP,
  DEFAULT_GO2RTC_CONFIG_WEBRTC,
} from '../../services/config/defaults.js';

export const logLevelGo2rtcSchema = zod.union([
  zod.literal('info'),
  zod.literal('debug'),
  zod.literal('trace'),
  zod.literal('warn'),
  zod.literal('error'),
  zod.literal('fatal'),
]);

export const logSchema = zod
  .object({
    format: zod.string().trim().default(DEFAULT_GO2RTC_CONFIG_LOGGER.format!),
    level: logLevelGo2rtcSchema.default(DEFAULT_GO2RTC_CONFIG_LOGGER.level!),
    api: logLevelGo2rtcSchema,
    exec: logLevelGo2rtcSchema,
    ngrok: logLevelGo2rtcSchema,
    rtsp: logLevelGo2rtcSchema,
    rtmp: logLevelGo2rtcSchema,
    homekit: logLevelGo2rtcSchema,
    webtorrent: logLevelGo2rtcSchema,
    hass: logLevelGo2rtcSchema.default(DEFAULT_GO2RTC_CONFIG_LOGGER.hass!),
    mp4: logLevelGo2rtcSchema,
    hls: logLevelGo2rtcSchema,
    mjpeg: logLevelGo2rtcSchema,
    streams: logLevelGo2rtcSchema,
    webrtc: logLevelGo2rtcSchema,
  })
  .strict();

export const apiSchema = zod
  .object({
    listen: zod
      .string()
      .trim()
      .transform(() => ''),
    username: zod.string().trim().optional(),
    password: zod.string().trim().optional(),
    origin: zod.string().trim().default(DEFAULT_GO2RTC_CONFIG_API.origin),
    // base_path: zod.string().trim(),   // dont allow to change these
    // static_dir: zod.string().trim(),  // dont allow to change these
    tls_listen: zod.string().trim().default(DEFAULT_GO2RTC_CONFIG_API.tls_listen),
    tls_cert: zod.string().trim(),
    tls_key: zod.string().trim(),
    tls_ca: zod.string().trim(),
  })
  .strict();

const streamSourceSchema = zod
  .string()
  .trim()
  .refine((val) => !/^\s*(exec|echo|expr):/i.test(val), 'Command-execution stream sources (exec:/echo:/expr:) are not allowed');

export const streamsSchema = zod.record(
  zod
    .string()
    .trim()
    .transform((val) => val.replace(/ /g, '_').toLowerCase()),
  zod.union([streamSourceSchema, streamSourceSchema.array()]),
);

export const preloadSchema = zod.record(zod.string().trim(), zod.string());

export const streamSecretsSchema = zod.record(zod.string().trim(), zod.record(zod.string().trim(), zod.union([zod.string().trim(), zod.number()])));

export const srtpSchema = zod
  .object({
    listen: zod.string().trim().default(DEFAULT_GO2RTC_CONFIG_SRTP.listen),
  })
  .strict();

export const rtmpSchema = zod
  .object({
    listen: zod.string().trim().default(DEFAULT_GO2RTC_CONFIG_RTMP.listen),
  })
  .strict();

export const rtspSchema = zod
  .object({
    listen: zod.string().trim().default(DEFAULT_GO2RTC_CONFIG_RTSP.listen),
    username: zod.string().trim().optional().default(DEFAULT_GO2RTC_CONFIG_RTSP.username!),
    password: zod.string().trim().optional().default(DEFAULT_GO2RTC_CONFIG_RTSP.password!),
    default_query: zod.string().trim().default(DEFAULT_GO2RTC_CONFIG_RTSP.default_query),
    pkt_size: zod.number().optional(),
  })
  .strict();

export const ffmpegSchema = zod.record(zod.string().trim(), zod.string().trim()).and(
  zod.object({
    bin: zod.string().trim().default(DEFAULT_GO2RTC_CONFIG_FFMPEG.bin),
    global: zod.string().trim().default(DEFAULT_GO2RTC_CONFIG_FFMPEG.global),
    file: zod.string().trim().default(DEFAULT_GO2RTC_CONFIG_FFMPEG.file),
    http: zod.string().trim().default(DEFAULT_GO2RTC_CONFIG_FFMPEG.http),
    rtsp: zod.string().trim().default(DEFAULT_GO2RTC_CONFIG_FFMPEG.rtsp),
    output: zod.string().trim().default(DEFAULT_GO2RTC_CONFIG_FFMPEG.output),
  }),
);

export const hassSchema = zod
  .object({
    config: zod.string().trim(),
  })
  .strict();

export const ngrokSchema = zod
  .object({
    command: zod.string().trim(),
  })
  .strict();

export const filterSchema = zod
  .object({
    candidates: zod.string().trim().array().optional(),
    networks: zod.string().trim().array().optional(),
    interfaces: zod.string().trim().array().optional(),
    ips: zod.string().trim().array().optional(),
    udp_ports: zod.string().trim().array().optional(),
  })
  .strict();

export const iceServerSchema = zod
  .object({
    urls: zod.string().trim().array(),
    username: zod.string().trim().optional(),
    credential: zod.string().trim().optional(),
  })
  .strict();

export const webrtcSchema = zod
  .object({
    listen: zod.string().trim().default(DEFAULT_GO2RTC_CONFIG_WEBRTC.listen),
    candidates: zod.string().trim().array().optional(),
    ice_servers: iceServerSchema.array().optional(),
    filters: filterSchema.optional(),
  })
  .strict();

export const homeKitSettingsSchema = zod
  .object({
    pin: zod.number(),
    name: zod.string().trim(),
    device_id: zod.string().trim(),
    device_private: zod.string().trim(),
  })
  .strict();

export const homeKitSchema = zod.record(zod.string().trim(), homeKitSettingsSchema.partial().optional().or(zod.undefined()).or(zod.null()));

export const shareSettingsSchema = zod
  .object({
    pwd: zod.string().trim(),
    src: zod.string().trim(),
  })
  .strict();

export const sharesSchema = zod.record(zod.string().trim(), shareSettingsSchema);

export const webtorrentSchema = zod
  .object({
    shares: sharesSchema,
  })
  .strict();

export const patchGo2RtcSchema = zod
  .object({
    log: logSchema.partial(),
    api: apiSchema,
    rtsp: rtspSchema,
    srtp: srtpSchema,
    rtmp: rtmpSchema,
    webrtc: webrtcSchema,
    ffmpeg: ffmpegSchema,
    secrets: streamSecretsSchema.optional(),
    preload: preloadSchema.optional(),
    streams: streamsSchema.optional(),
    homekit: homeKitSchema.optional(),
    hass: hassSchema.partial().optional(),
    webtorrent: webtorrentSchema.partial().optional(),
    ngrok: ngrokSchema.partial().optional(),
  })
  .strict();

export type PatchGo2RtcConfigInput = zod.output<typeof patchGo2RtcSchema>;
