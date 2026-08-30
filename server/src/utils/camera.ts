import { GOP_REGEX, SOURCE_HANDSHAKE_TIMEOUT_REGEX, SOURCE_TIMEOUT_REGEX } from '../api/utils/regex.js';

import type { RTSPUrlOptions, SnapshotUrlOptions } from '@camera.ui/sdk';

const NO_AUDIO_FLAG = '#noAudio';
const NO_BACKCHANNEL_FLAG = '#noBackchannel';

export interface SourceUrlFlags {
  preload: boolean;
  muted?: boolean;
  backchannelDisabled?: boolean;
  timeout?: number;
  handshakeTimeout?: number;
}

export function applySourceUrlFlags(url: string, source: SourceUrlFlags): string {
  if (source.preload && !GOP_REGEX.test(url)) {
    url += '#gop=1';
  } else if (!source.preload && GOP_REGEX.test(url)) {
    url = url.replace(GOP_REGEX, '');
  }

  if (source.muted && !url.includes(NO_AUDIO_FLAG)) {
    url += NO_AUDIO_FLAG;
  } else if (!source.muted && url.includes(NO_AUDIO_FLAG)) {
    url = url.replace(NO_AUDIO_FLAG, '');
  }

  if (source.backchannelDisabled && !url.includes(NO_BACKCHANNEL_FLAG)) {
    url += NO_BACKCHANNEL_FLAG;
  } else if (!source.backchannelDisabled && url.includes(NO_BACKCHANNEL_FLAG)) {
    url = url.replace(NO_BACKCHANNEL_FLAG, '');
  }

  url = applyNumberFlag(url, SOURCE_TIMEOUT_REGEX, 'timeout', source.timeout);
  url = applyNumberFlag(url, SOURCE_HANDSHAKE_TIMEOUT_REGEX, 'handshake_timeout', source.handshakeTimeout);

  return url;
}

function applyNumberFlag(url: string, regex: RegExp, name: string, value: number | undefined): string {
  const flag = value && value > 0 ? `#${name}=${Math.round(value)}` : '';
  if (regex.test(url)) {
    return url.replace(regex, flag);
  }
  return url + flag;
}

export function buildTargetUrl(rtspUrl: string, options: RTSPUrlOptions): string {
  const url = new URL(rtspUrl);
  const auth = url.username ? `${url.username}${url.password ? `:${url.password}` : ''}@` : '';
  const baseUrl = `${url.protocol}//${auth}${url.host}${url.pathname}`;

  const { video = true, audio = true, audioSingleTrack = true, backchannel = false, timeout = 15, gop = true } = options;
  const validatedTimeout = Math.min(Math.max(5, timeout), 30);

  const params: string[] = [];

  if (video) {
    params.push('video');
  }

  if (audio) {
    if (typeof audio === 'boolean') {
      params.push('audio');
    } else if (Array.isArray(audio)) {
      if (audioSingleTrack) {
        params.push(`audio=${audio.join(',')}`);
      } else {
        audio.forEach((codec) => {
          params.push(`audio=${codec}`);
        });
      }
    } else {
      params.push(`audio=${audio}`);
    }
  }

  if (backchannel) {
    params.push('backchannel=opus,pcma,pcmu');
  }

  if (gop) {
    params.push('gop=1');
  } else {
    params.push('gop=0');
  }

  params.push(`timeout=${validatedTimeout}`);

  return `${baseUrl}?${params.join('&')}`;
}

export function buildSnapshotUrl(cameraName: string, sourceName: string, snapshotUrl: string, options: SnapshotUrlOptions): string {
  const url = new URL(snapshotUrl);
  const baseUrl = `${url.protocol}//${url.host}${url.pathname}`;

  const { width, height, rotate, cache, hw, gop = true } = options;

  const params: string[] = [];

  const source = createSourceName(cameraName, sourceName);
  params.push(`src=${source}`);

  if (width && width > 0) {
    params.push(`w=${width}`);
  }

  if (height && height > 0) {
    params.push(`h=${height}`);
  }

  if (rotate) {
    params.push(`rotate=${rotate}`);
  }

  if (cache) {
    params.push(`cache=${cache}`);
  }

  if (hw) {
    params.push(`hw=${hw}`);
  }

  if (gop) {
    params.push('gop=1');
  } else {
    params.push('gop=0');
  }

  return `${baseUrl}?${params.join('&')}`;
}

export function normalizeCameraName(name: string): string {
  return name.replace(/ /g, '_').toLowerCase();
}

export function createSourceName(cameraName: string, sourceName: string): string {
  return `cui_${normalizeCameraName(cameraName)}_${normalizeCameraName(sourceName)}`;
}
