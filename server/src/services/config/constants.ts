import { ffmpegPath, isFfmpegAvailable } from 'node-av/ffmpeg';
import { platform } from 'node:os';

import {
  DEFAULT_CONFIG_LOGGER,
  DEFAULT_CONFIG_PLUGINS,
  DEFAULT_CONFIG_PORT,
  DEFAULT_CONFIG_SSL,
  DEFAULT_GO2RTC_CONFIG_API,
  DEFAULT_GO2RTC_CONFIG_FFMPEG,
  DEFAULT_GO2RTC_CONFIG_LOGGER,
  DEFAULT_GO2RTC_CONFIG_RTMP,
  DEFAULT_GO2RTC_CONFIG_RTSP,
  DEFAULT_GO2RTC_CONFIG_SRTP,
  DEFAULT_GO2RTC_CONFIG_WEBRTC,
  ELECTRON_PORT_OFFSET,
} from './defaults.js';

import type { IceServer } from '@camera.ui/sdk/internal';
import type { Go2RtcConfig, IConfig } from './types.js';

// asar = true => app.asar.unpacked
// asar = false => app
export const ELECTRON_ASAR_UNPACKED = 'app';

export const PROCESS_IDENTIFIER = '--id=camera.ui';

export const DEFAULT_ICE_SERVERS: IceServer[] = [
  {
    urls: ['stun:stun.l.google.com:19302'],
  },
];

export const DEFAULT_CONFIG: IConfig = {
  port: DEFAULT_CONFIG_PORT,
  ssl: DEFAULT_CONFIG_SSL,
  logger: DEFAULT_CONFIG_LOGGER,
  plugins: DEFAULT_CONFIG_PLUGINS,
  cors: {
    origins: [],
  },
  workers: {
    enabled: false,
    address: '',
    port: 7422 + ELECTRON_PORT_OFFSET,
  },
  worker: {
    master: '',
    apiPort: DEFAULT_CONFIG_PORT,
    pairingCode: '',
    name: '',
    capabilities: [],
  },
};

export const DEFAULT_GO2RTC_CONFIG: Go2RtcConfig = {
  log: DEFAULT_GO2RTC_CONFIG_LOGGER,
  api: DEFAULT_GO2RTC_CONFIG_API,
  rtsp: DEFAULT_GO2RTC_CONFIG_RTSP,
  srtp: DEFAULT_GO2RTC_CONFIG_SRTP,
  rtmp: DEFAULT_GO2RTC_CONFIG_RTMP,
  webrtc: DEFAULT_GO2RTC_CONFIG_WEBRTC,
  ffmpeg: {
    ...DEFAULT_GO2RTC_CONFIG_FFMPEG,
    bin: !isFfmpegAvailable() ? (platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg') : ffmpegPath().replace('app.asar', ELECTRON_ASAR_UNPACKED),
  },
};

export const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'https://auth.cameraui.com';
export const BILLING_SERVICE_URL = process.env.BILLING_SERVICE_URL ?? 'https://billing.cameraui.com';
export const CLOUD_SERVICE_URL = process.env.CLOUD_SERVICE_URL ?? 'https://cloud.cameraui.com';
export const PROXY_SERVICE_URL = process.env.PROXY_SERVICE_URL ?? 'https://proxy.cameraui.com';
export const PROXY_TUNNEL_ENDPOINT = process.env.PROXY_TUNNEL_ENDPOINT ?? 'tunnel.cameraui.com:9092';
export const SHARE_SERVICE_URL = process.env.SHARE_SERVICE_URL ?? 'https://share.cameraui.com';
