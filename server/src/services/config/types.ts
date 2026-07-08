import type { IceServer } from '@camera.ui/sdk/internal';

export interface EnvironmentInfo {
  development: boolean;
  docker: boolean;
  electron: boolean;
  homeassistant: boolean;
}

export interface Secrets {
  jwtAccessKey: string;
  jwtRefreshKey: string;
  jwt2faKey: string;
  twoFactorKey: string;
}

export interface RuntimeInfo {
  name: string;
  status: RUNTIME_STATUS;
}

export const enum RUNTIME_STATUS {
  READY = 'ready',
  RESTARTING = 'restarting',
  STARTING = 'starting',
  STARTED = 'started',
  STOPPED = 'stopped',
  ERROR = 'error',
  UNKNOWN = 'unknown',
}

export interface PluginsSettings {
  disabledPlugins: string[];
  allowBuildScripts?: boolean;
}

export interface WorkersConfig {
  enabled?: boolean;
  address?: string;
  port?: number;
}

export interface WorkerConfig {
  master?: string;
  apiPort?: number;
  pairingCode?: string;
  name?: string;
  capabilities?: string[];
}

export interface CorsConfig {
  origins?: string[];
}

export interface IConfig {
  port: number;
  host?: string;
  ffmpegPath?: string;
  ssl: IConfigSSL;
  logger: Logger;
  plugins: PluginsSettings;
  cors?: CorsConfig;
  workers?: WorkersConfig;
  worker?: WorkerConfig;
}

export type LoggingLevel = 'info' | 'debug' | 'warn' | 'error' | 'trace';

export interface Logger {
  level: LoggingLevel;
}

export interface Mqtt {
  enabled?: boolean;
  host?: string;
  port?: number;
  topicPrefix?: string;
  clientId?: string;
  user?: string;
  password?: string;
  tls?: MqttTLS;
}

export interface MqttTLS {
  enabled?: boolean;
  cert?: string;
  key?: string;
}

export interface IConfigSSL {
  certFile: string;
  keyFile: string;
  caFile: string;
  addresses?: string[];
}

// go2rtc config
export interface Go2RtcConfig {
  log: Partial<Log>;
  api: API;
  rtsp: RTSP;
  srtp: SRTP;
  rtmp: RTMP;
  webrtc: Webrtc;
  ffmpeg: Ffmpeg;
  secrets?: Partial<StreamSecrets>;
  preload?: Partial<PreloadStreams>;
  streams?: Partial<Streams>;
  homekit?: Partial<HomeKit>;
  hass?: Partial<Hass>;
  webtorrent?: Partial<Webtorrent>;
  ngrok?: Partial<Ngrok>;
}

export type LogLevel = 'info' | 'debug' | 'trace' | 'warn' | 'error' | 'fatal';

export interface Log {
  format: string;
  level: LogLevel;
  api: LogLevel;
  exec: LogLevel;
  ngrok: LogLevel;
  rtsp: LogLevel;
  rtmp: LogLevel;
  homekit: LogLevel;
  webtorrent: LogLevel;
  hass: LogLevel;
  mp4: LogLevel;
  hls: LogLevel;
  mjpeg: LogLevel;
  streams: LogLevel;
  webrtc: LogLevel;
}

export interface API {
  origin: string;
  listen: string;
  username?: string;
  password?: string;
  // base_path: string;
  // static_dir: string;
  // origin: string;
  tls_listen: string;
  tls_cert: string;
  tls_key: string;
  tls_ca: string;
}

export type StreamSecrets = Record<string, Record<string, string | number>>;

export type Streams = Record<string, string | string[]>;

export type PreloadStreams = Record<string, string>;

export interface SRTP {
  listen: string;
}

export interface RTMP {
  listen: string;
}

export interface RTSP {
  listen: string;
  username?: string;
  password?: string;
  default_query: string;
  pkt_size?: number;
}

export interface Webrtc {
  listen: string;
  candidates?: string[];
  ice_servers?: IceServer[];
  filters?: WebrtcFilter;
}

export interface WebrtcFilter {
  candidates?: string[];
  networks?: string[];
  interfaces?: string[];
  ips?: string[];
  udp_ports?: string[];
}

export interface Ffmpeg {
  bin: string;
  global: string;
  file: string;
  http: string;
  rtsp: string;
  output: string;
  [key: string]: string;
}

export type HomeKit = Record<string, Partial<HomeKitSettings> | null | undefined>;

export interface Hass {
  config: string;
}

export interface HomeKitSettings {
  pin: number;
  name: string;
  device_id: string;
  device_private: string;
}

export interface Webtorrent {
  shares: Shares;
}

export type Shares = Record<string, Partial<ShareSettings>>;

export interface ShareSettings {
  pwd: string;
  src: string;
}

export interface Ngrok {
  command: string;
}

export interface SSLConfig {
  cert: Buffer;
  key: Buffer;
  ca: Buffer;
}
