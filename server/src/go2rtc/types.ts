export interface ApplicationResponse {
  config_path: string;
  host: string;
  rtsp: RTSPInfo;
  version: string;
}

export interface RTSPInfo {
  listen: string;
  default_query: string;
  PacketSize: number;
}

export type DeviceSourceType = 'HomeKit' | 'Onvif' | 'Hass' | 'GoPro' | 'FFmpeg' | 'DVRip' | 'Webtorrent';

export interface BaseDeviceSource {
  url: string;
  type: DeviceSourceType;
}

export interface DeviceSource extends BaseDeviceSource {
  name?: string;
  id?: string;
  info?: string;
  location?: string;
}

export interface HomeKitSource extends BaseDeviceSource {
  name: string;
  info: string;
  url: string;
  location: string;
  type: 'HomeKit';
}

export interface OnvifSource extends BaseDeviceSource {
  id?: string;
  name?: string;
  url: string;
  info?: string;
  encoding?: string;
  width?: number;
  height?: number;
  type: 'Onvif';
}

export interface HassSource extends BaseDeviceSource {
  name: string;
  url: string;
  location: string;
  type: 'Hass';
}

export interface GoProSource extends BaseDeviceSource {
  name: string;
  url: string;
  type: 'GoPro';
}

export interface FFmpegSource extends BaseDeviceSource {
  name: string;
  url: string;
  type: 'FFmpeg';
}

export interface DVRipSource extends BaseDeviceSource {
  name: string;
  url: string;
  type: 'DVRip';
}

export interface WebtorrentSource extends BaseDeviceSource {
  id: string;
  url: string;
  type: 'Webtorrent';
}

export interface HomeKitPairResponse {
  source: {
    name?: string;
    url: string;
  };
}

export interface ExitData {
  code: number;
}

export interface NameData {
  name: string;
}

export interface SourceData {
  src: string;
}

export interface SourceDataWithQuery extends SourceData {
  gop?: 0 | 1;
}

export interface HomeKitPairData {
  id: string;
  url: string;
  pin: string;
}

export interface UnpairData {
  id: string;
}

export interface CreateStreamData {
  name: string;
  src: string[];
}

export interface UpdateStreamData {
  name: string;
  src: string;
}

export interface IntercomData {
  name: string;
  dst: string;
}

export interface SourceLoginData {
  username?: string;
  password?: string;
}

export interface Go2RTCCodec {
  codec_name: string;
  codec_type: string;
  sample_rate?: number;
  level?: number;
  profile?: string;
  channels?: number;
}

export interface Go2RTCReceiver {
  id: number;
  codec: Go2RTCCodec;
  childs?: number[];
  bytes?: number;
  packets?: number;
}

export interface Go2RTCSender {
  id: number;
  codec: Go2RTCCodec;
  parent?: number;
  bytes?: number;
  packets?: number;
}

export interface Go2RTCMixer {
  id: number;
  codec: Go2RTCCodec;
  parents?: number[];
  childs?: number[];
}

export interface Go2RTCProducer {
  id?: number;
  format_name?: string;
  protocol?: string;
  source?: string;
  remote_addr?: string;
  url?: string;
  sdp?: string;
  user_agent?: string;
  medias?: string[];
  receivers?: Go2RTCReceiver[];
  senders?: Go2RTCSender[];
  bytes_recv?: number;
  mixer?: Go2RTCMixer;
}

export interface Go2RTCConsumer {
  id: number;
  format_name: string;
  protocol: string;
  remote_addr: string;
  user_agent: string;
  medias: string[];
  source?: string;
  sdp?: string;
  receivers?: Go2RTCReceiver[];
  senders?: Go2RTCSender[];
}

export interface Go2RTCProbe {
  producers: Go2RTCProducer[];
  consumers: Go2RTCConsumer[];
}

export interface Go2RTCPreload {
  src: string;
  status: 'started' | 'stopped';
}

export type StreamStatus = 'connected' | 'connecting' | 'error' | 'idle';

export type StreamStatusResponse = Record<string, StreamStatus>;

export const sourcePrefixes = [
  'bubble://',
  'cui://',
  'doorbird://',
  'dvrip://',
  'echo:',
  'eseecloud://',
  'exec:',
  'expr:',
  'ffmpeg:',
  'flussonic://',
  'gopro://',
  'hass:',
  'homekit://',
  'http://',
  'https://',
  'httpx://',
  'isapi://',
  'ivideon:',
  'kasa://',
  'nest:',
  'onvif://',
  'ring:',
  'roborock://',
  'rtmp://',
  'rtsp://',
  'rtspx://',
  'tapo://',
  'tcp://',
  'tuya://',
  'xiaomi://',
  'yandex:',
  'webrtc:',
  'webtorrent:',
  'wyze://',
] as const;

export const rtspPresets = ['#backchannel=', '#header=', '#media=audio', '#media=video', '#timeout=10', '#timeout=20', '#timeout=30', '#transport='] as const;

export const ffmpegPresets = [
  '#audio=aac',
  '#audio=aac/16000',
  '#audio=mp3',
  '#audio=opus',
  '#audio=pcm',
  '#audio=pcm/8000',
  '#audio=pcm/16000',
  '#audio=pcm/48000',
  '#audio=pcma',
  '#audio=pcma/8000',
  '#audio=pcma/16000',
  '#audio=pcma/48000',
  '#audio=pcml',
  '#audio=pcml/8000',
  '#audio=pcml/44100',
  '#audio=pcmu',
  '#audio=pcmu/8000',
  '#audio=pcmu/16000',
  '#audio=pcmu/48000',
  '#drawtext',
  '#hardware',
  '#hardware=cuda',
  '#hardware=dxva2',
  '#hardware=rkmpp',
  '#hardware=v4l2m2m',
  '#hardware=vaapi',
  '#hardware=videotoolbox',
  '#height=',
  '#raw=',
  '#rotate=-90',
  '#rotate=90',
  '#rotate=180',
  '#rotate=270',
  '#video=copy',
  '#video=h264',
  '#video=h265',
  '#video=mjpeg',
  '#width=',
] as const;

export const homekitPresets = ['client_id=', 'client_private=', 'device_id=', 'device_public='] as const;
export const httpPresets = ['#header='] as const;
export const nestPresets = ['client_id=', 'client_secret=', 'refresh_token=', 'project_id=', 'device_id='] as const;
export const ringPresets = ['device_id=', 'refresh_token='] as const;
export const webrtcPresets = ['#client_id=', '#format=openipc', '#format=wyze', '#format=kinesis', '#ice_servers='] as const;

export type SourcePrefixes = (typeof sourcePrefixes)[number];
export type RtspPresets = (typeof rtspPresets)[number];
export type FFmpegPresets = (typeof ffmpegPresets)[number];
export type HomekitPresets = (typeof homekitPresets)[number];
export type HttpPresets = (typeof httpPresets)[number];
export type NestPresets = (typeof nestPresets)[number];
export type WebrtcPresets = (typeof webrtcPresets)[number];
