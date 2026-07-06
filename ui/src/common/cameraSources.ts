import { sourcePrefixes } from '@shared/types';

import type { CameraRole } from '@camera.ui/sdk';
import type { SourcePrefixes } from '@shared/types';

export interface Go2RtcSourcesModel {
  protocol: SourcePrefixes;
  url: string[];
}

export interface Go2RtcModel {
  _id: string;
  name: string;
  role: CameraRole;
  urls: Go2RtcSourcesModel[];
  useForSnapshot: boolean;
  hotMode: boolean;
  preload: boolean;
}

export function fixSource(source: Go2RtcSourcesModel): string {
  let sourceString = source.url.join('');

  switch (source.protocol) {
    case 'nest:':
    case 'ring:':
    case 'yandex:':
    case 'webtorrent:':
      if (!sourceString.startsWith('?') && !sourceString.startsWith(source.protocol)) {
        sourceString = `?${sourceString}`;
      }
  }

  if (sourceString.startsWith(source.protocol)) {
    return sourceString;
  } else {
    return `${source.protocol}${sourceString}`;
  }
}

export function parseSourceUrl(url: string): Go2RtcSourcesModel {
  let match: SourcePrefixes | undefined;

  for (const prefix of sourcePrefixes) {
    if (url.startsWith(prefix) && (!match || prefix.length > match.length)) {
      match = prefix;
    }
  }

  if (!match) {
    return { protocol: 'rtsp://', url: [url] };
  }

  return { protocol: match, url: [url.slice(match.length)] };
}

export function isGeneratedUrl(url: string): boolean {
  return url.startsWith('cui://') && url.includes('/api/cameras/streams/');
}

export function isManagedUrlEntry(entry: Go2RtcSourcesModel): boolean {
  return isGeneratedUrl(fixSource(entry));
}
