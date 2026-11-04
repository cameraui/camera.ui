import { TURN_URL_PATTERN } from '../../api/schemas/remote.schema.js';

import type { IceServer } from '@camera.ui/sdk/internal';

const BROWSER_STUN_URL = /^stun:/i;

export function isTurnServer(server: IceServer): boolean {
  return server.urls.some((url) => TURN_URL_PATTERN.test(url));
}

export function browserIceServers(iceServers: IceServer[]): IceServer[] {
  return iceServers.flatMap((server) => {
    // browsers know no stuns: and refuse a turn: address without credentials
    const urls = server.urls.filter((url) => (TURN_URL_PATTERN.test(url) ? !!server.username && !!server.credential : BROWSER_STUN_URL.test(url)));
    return urls.length ? [{ ...server, urls }] : [];
  });
}

export function browserStunServers(iceServers: IceServer[]): IceServer[] {
  const urls = iceServers.flatMap((server) => server.urls.filter((url) => BROWSER_STUN_URL.test(url)));
  return urls.length ? [{ urls }] : [];
}
