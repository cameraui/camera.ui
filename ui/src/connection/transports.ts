import { Logger } from '@camera.ui/logger';
import { createHttpTransport } from '@camera.ui/transport/transports/http';
import { createNatsTransport } from '@camera.ui/transport/transports/nats';
import { createSocketioTransport } from '@camera.ui/transport/transports/socketio';
import { createWsTransport } from '@camera.ui/transport/transports/ws';

import { installNativeHttp } from './nativeHttp.js';

import type { TransportSpec } from '@camera.ui/transport';
import type { HttpTransport } from '@camera.ui/transport/transports/http';
import type { NatsTransport } from '@camera.ui/transport/transports/nats';
import type { SocketioTransport } from '@camera.ui/transport/transports/socketio';
import type { WsTransport } from '@camera.ui/transport/transports/ws';

export const HTTP_SPEC: TransportSpec = { id: 'http', kind: 'request', phaseGating: false };
export const SOCKETIO_SPEC: TransportSpec = { id: 'socketio', kind: 'persistent', phaseGating: true };
export const NATS_SPEC: TransportSpec = { id: 'nats', kind: 'persistent', phaseGating: true };
export const WS_SPEC: TransportSpec = { id: 'ws', kind: 'per-resource', phaseGating: false };

export const TRANSPORT_SPECS: ReadonlyMap<string, TransportSpec> = new Map([
  [HTTP_SPEC.id, HTTP_SPEC],
  [SOCKETIO_SPEC.id, SOCKETIO_SPEC],
  [NATS_SPEC.id, NATS_SPEC],
  [WS_SPEC.id, WS_SPEC],
]);

export interface TransportBundle {
  readonly http: HttpTransport;
  readonly socketio: SocketioTransport;
  readonly nats: NatsTransport;
  readonly ws: WsTransport;
}

export function createTransports(apiPrefix: string): TransportBundle {
  const http = createHttpTransport({ apiPrefix, spec: HTTP_SPEC, logger: new Logger('HttpT') });
  installNativeHttp(http.client);
  const socketio = createSocketioTransport({ spec: SOCKETIO_SPEC, logger: new Logger('SioT') });
  const nats = createNatsTransport({ spec: NATS_SPEC, logger: new Logger('NatsT') });
  const ws = createWsTransport({ spec: WS_SPEC, logger: new Logger('WsT') });
  return { http, socketio, nats, ws };
}
