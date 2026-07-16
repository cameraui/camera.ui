import { GOP_REGEX } from '../api/utils/regex.js';

import type { RTSPUrlOptions, SnapshotUrlOptions } from '@camera.ui/sdk';

const NO_AUDIO_FLAG = '#noAudio';

export function applySourceUrlFlags(url: string, source: { preload: boolean; muted?: boolean }): string {
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

  return url;
}

export function buildTargetUrl(rtspUrl: string, options: RTSPUrlOptions): string {
  const url = new URL(rtspUrl);
  const baseUrl = `${url.protocol}//${url.host}${url.pathname}`;

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

export function createSourceName(cameraName: string, sourceName: string): string {
  return `cui_${cameraName.replace(/ /g, '_').toLowerCase()}_${sourceName.replace(/ /g, '_').toLowerCase()}`;
}
