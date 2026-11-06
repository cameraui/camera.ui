import { IS_ELECTRON } from '@camera.ui/common/utils';
import { hostname } from 'node:os';

import type { API, Ffmpeg, Log, Logger, Onvif, PluginsSettings, RTMP, RTSP, SRTP, Webrtc, WorkerConfig } from './types.js';

export const DESKTOP_PORT_OFFSET = 100;
export const ELECTRON_PORT_OFFSET = IS_ELECTRON ? DESKTOP_PORT_OFFSET : 0;

const withOffset = (base: number): number => base + ELECTRON_PORT_OFFSET;
const listenWithOffset = (host: string, base: number): string => `${host}:${withOffset(base)}`;

export const DEFAULT_CONFIG_PORT = withOffset(3443);
export const MASTER_API_PORT = 3443;
export const DEFAULT_CONFIG_HOST = '0.0.0.0';
export const DEFAULT_CONFIG_LOGGER: Logger = {
  level: 'trace',
};
export const DEFAULT_CONFIG_PLUGINS: PluginsSettings = {
  disabledPlugins: [],
  allowBuildScripts: false,
  betaVersions: false,
};

export const DEFAULT_GO2RTC_CONFIG_LOGGER: Partial<Log> = {
  level: 'debug',
  format: 'text',
  hass: 'info',
};
export const DEFAULT_GO2RTC_CONFIG_API: API = {
  origin: '*',
  listen: '',
  tls_listen: listenWithOffset('127.0.0.1', 2000),
  tls_cert: '',
  tls_key: '',
  tls_ca: '',
};
export const DEFAULT_GO2RTC_CONFIG_RTSP: RTSP = {
  listen: listenWithOffset('0.0.0.0', 2001),
  default_query: 'video&audio',
  username: 'admin',
  password: 'admin',
};
export const DEFAULT_GO2RTC_CONFIG_ONVIF: Onvif = {
  listen: '',
};
export const DEFAULT_ONVIF_PORT = withOffset(2005);
export const NEW_INSTALL_RTSP_USERNAME = 'cameraui';
export const DEFAULT_GO2RTC_CONFIG_SRTP: SRTP = {
  listen: listenWithOffset('0.0.0.0', 2002),
};
export const DEFAULT_GO2RTC_CONFIG_RTMP: RTMP = {
  listen: listenWithOffset('0.0.0.0', 2003),
};
export const DEFAULT_GO2RTC_CONFIG_WEBRTC: Webrtc = {
  listen: `:${withOffset(2004)}`,
  candidates: [`stun:${withOffset(2004)}`],
};
export const DEFAULT_GO2RTC_CONFIG_FFMPEG: Ffmpeg = {
  bin: 'ffmpeg',
  global: '-hide_banner',
  file: '-re -stream_loop -1 -i {input}',
  http: '-fflags +discardcorrupt+nobuffer -flags low_delay -probesize 500000 -analyzeduration 0 -avioflags direct -i {input}',
  // eslint-disable-next-line @stylistic/max-len
  rtsp: '-fflags +discardcorrupt+nobuffer -flags low_delay -probesize 500000 -analyzeduration 0 -avioflags direct -user_agent go2rtc/ffmpeg -rtsp_transport tcp -i {input}',
  output: '-user_agent ffmpeg/go2rtc -rtsp_transport tcp -f rtsp {output}',
};

export function workerName(worker: WorkerConfig | undefined): string {
  const name = worker?.name?.trim();
  if (name) return name;
  const host = hostname().split('.')[0];
  return host ? host : 'worker';
}
