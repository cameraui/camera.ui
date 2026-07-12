import { allowedSourceProtocols } from '@shared/types';

import type { CameraRole } from '@camera.ui/sdk';
import type { SourcePrefixes } from '@shared/types';

export interface Go2RtcModel {
  _id: string;
  name: string;
  role: CameraRole;
  urls: string[];
  useForSnapshot: boolean;
  hotMode: boolean;
  preload: boolean;
  muted?: boolean;
}

// Protocols whose payload is a query string; go2rtc expects a leading "?".
const QUERY_PREFIX_PROTOCOLS: SourcePrefixes[] = ['nest:', 'ring:', 'yandex:', 'webtorrent:'];

export function detectProtocol(url: string): SourcePrefixes | undefined {
  const trimmed = url.trim();

  let match: SourcePrefixes | undefined;
  for (const prefix of allowedSourceProtocols) {
    if (trimmed.startsWith(prefix) && (!match || prefix.length > match.length)) {
      match = prefix;
    }
  }
  return match;
}

export function normalizeSource(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';

  for (const prefix of QUERY_PREFIX_PROTOCOLS) {
    if (trimmed.startsWith(prefix)) {
      const rest = trimmed.slice(prefix.length);
      if (rest && !rest.startsWith('?')) return `${prefix}?${rest}`;
      return trimmed;
    }
  }

  return trimmed;
}

export function isGeneratedUrl(url: string): boolean {
  return url.startsWith('cui://') && url.includes('/api/cameras/streams/');
}
