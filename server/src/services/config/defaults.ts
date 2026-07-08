import { IS_ELECTRON } from '@camera.ui/common/utils';

import type { API, Ffmpeg, IConfigSSL, Log, Logger, PluginsSettings, RTMP, RTSP, SRTP, Webrtc } from './types.js';

export const ELECTRON_PORT_OFFSET = IS_ELECTRON ? 100 : 0;

const withOffset = (base: number): number => base + ELECTRON_PORT_OFFSET;
const listenWithOffset = (host: string, base: number): string => `${host}:${withOffset(base)}`;

// server
export const DEFAULT_CONFIG_PORT = withOffset(3443);
export const DEFAULT_CONFIG_HOST = '::';
export const DEFAULT_CONFIG_SSL: IConfigSSL = {
  certFile: '',
  keyFile: '',
  caFile: '',
  addresses: ['127.0.0.1'],
};
export const DEFAULT_CONFIG_LOGGER: Logger = {
  level: 'trace',
};
export const DEFAULT_CONFIG_PLUGINS: PluginsSettings = {
  disabledPlugins: [],
  allowBuildScripts: false,
};

// go2rtc
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
  default_query: 'video=all&audio=all',
  username: 'admin',
  password: 'admin',
};
export const DEFAULT_GO2RTC_CONFIG_SRTP: SRTP = {
  listen: listenWithOffset('0.0.0.0', 2002),
};
export const DEFAULT_GO2RTC_CONFIG_RTMP: RTMP = {
  listen: listenWithOffset('0.0.0.0', 2003),
};
export const DEFAULT_GO2RTC_CONFIG_WEBRTC: Webrtc = {
  listen: `:${withOffset(2004)}/tcp`,
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
