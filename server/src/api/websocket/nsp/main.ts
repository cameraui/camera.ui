import { inject } from '../../../container.js';
import { createSourceName } from '../../../utils/camera.js';
import { onClientEvent } from '../client-events.js';

import type { Namespace, Server, Socket } from 'socket.io';
import type { CameraUiAPI } from '../../../api.js';
import type { Go2RtcState } from '../../../go2rtc/state.js';
import type { Go2RTCOfferCodec, Go2RTCOffers, StreamStatus } from '../../../go2rtc/types.js';
import type { CameraUi } from '../../../master.js';
import type { SocketNsp } from '../types.js';

interface StreamCodecs {
  video: Go2RTCOfferCodec[];
  audio: Go2RTCOfferCodec[];
}

interface CameraStreams {
  status: Record<string, StreamStatus>;
  connections: Record<string, number>;
  codecs: Record<string, StreamCodecs | undefined>;
}

type StreamMaps = { [K in keyof CameraStreams]: Record<string, CameraStreams[K]> };

type StreamStatusDelta = Record<string, (Omit<CameraStreams, 'codecs'> & Partial<Pick<CameraStreams, 'codecs'>>) | null>;

interface DeltaKey {
  state: string;
  codecs: string;
}

const FULL_ROOM = 'stream-status:full';
const DELTA_ROOM = 'stream-status:delta';
const BROADCAST_DELAY_MS = 100;

export class MainNamespace {
  public nsp: Namespace;
  public nspName: SocketNsp = '/camera.ui';

  private cameraui: CameraUi;
  private api: CameraUiAPI;
  private go2rtcState: Go2RtcState;
  private broadcastTimer?: NodeJS.Timeout;
  private lastFull?: string;
  private lastDeltas = new Map<string, DeltaKey>();

  constructor(io: Server) {
    this.cameraui = inject('cameraui');
    this.api = inject('api');
    this.go2rtcState = inject('go2rtcState');

    this.nsp = io.of(this.nspName);
    this.nsp.on('connection', (socket: Socket) => {
      onClientEvent(socket, 'get-status', this.getStatus.bind(this));

      onClientEvent(socket, 'get-stream-status', (options?: { deltas?: boolean }) => {
        this.sendStreamStatus(socket, options?.deltas === true);
      });

      onClientEvent(socket, 'stream-status:unsubscribe', () => {
        socket.leave(FULL_ROOM);
        socket.leave(DELTA_ROOM);
      });
    });

    this.go2rtcState.on('stream', () => this.scheduleBroadcast());
    this.go2rtcState.on('snapshot', () => this.scheduleBroadcast());
  }

  public async getStatus(_payload: any, callback?: (data: 'loading' | 'ready') => void): Promise<'loading' | 'ready'> {
    const status = this.cameraui.status;
    callback?.(status);
    return status;
  }

  private sendStreamStatus(socket: Socket, deltas: boolean): void {
    const streams = this.cameraStreams();
    this.broadcast(streams);

    const room = deltas || socket.rooms.has(DELTA_ROOM) ? DELTA_ROOM : FULL_ROOM;
    const maps = streamMaps(streams);

    if (!this.roomSize(room)) {
      if (room === FULL_ROOM) this.lastFull = JSON.stringify(maps);
      else this.lastDeltas = new Map([...streams].map(([cameraId, camera]) => [cameraId, deltaKey(camera)]));
    }
    if (room === DELTA_ROOM) socket.leave(FULL_ROOM);
    socket.join(room);

    socket.emit('stream-status', maps.status);
    socket.emit('stream-connections', maps.connections);
    socket.emit('stream-codecs', maps.codecs);
  }

  private scheduleBroadcast(): void {
    if (this.broadcastTimer) return;
    this.broadcastTimer = setTimeout(() => this.broadcast(), BROADCAST_DELAY_MS);
  }

  private broadcast(streams?: Map<string, CameraStreams>): void {
    clearTimeout(this.broadcastTimer);
    this.broadcastTimer = undefined;

    const full = this.roomSize(FULL_ROOM) > 0;
    const deltas = this.roomSize(DELTA_ROOM) > 0;
    if (!full) this.lastFull = undefined;
    if (!deltas) this.lastDeltas.clear();
    if (!full && !deltas) return;

    streams ??= this.cameraStreams();
    if (full) this.broadcastFull(streams);
    if (deltas) this.broadcastDeltas(streams);
  }

  private broadcastFull(streams: Map<string, CameraStreams>): void {
    const maps = streamMaps(streams);
    const key = JSON.stringify(maps);
    if (key === this.lastFull) return;
    this.lastFull = key;

    const room = this.nsp.to(FULL_ROOM);
    room.emit('stream-status', maps.status);
    room.emit('stream-connections', maps.connections);
    room.emit('stream-codecs', maps.codecs);
  }

  private broadcastDeltas(streams: Map<string, CameraStreams>): void {
    const delta: StreamStatusDelta = {};

    for (const [cameraId, camera] of streams) {
      const key = deltaKey(camera);
      const last = this.lastDeltas.get(cameraId);
      if (last?.state === key.state && last.codecs === key.codecs) continue;

      const { status, connections, codecs } = camera;
      delta[cameraId] = last?.codecs === key.codecs ? { status, connections } : { status, connections, codecs };
      this.lastDeltas.set(cameraId, key);
    }

    for (const cameraId of this.lastDeltas.keys()) {
      if (streams.has(cameraId)) continue;
      delta[cameraId] = null;
      this.lastDeltas.delete(cameraId);
    }

    if (Object.keys(delta).length > 0) {
      this.nsp.to(DELTA_ROOM).emit('stream-status-delta', delta);
    }
  }

  private cameraStreams(): Map<string, CameraStreams> {
    const result = new Map<string, CameraStreams>();

    for (const camera of this.api.getCameras()) {
      const streams: CameraStreams = { status: {}, connections: {}, codecs: {} };
      for (const source of camera.sources) {
        if (source.role === 'snapshot') {
          continue;
        }
        const name = createSourceName(camera.name, source.name);
        const state = this.go2rtcState.get(name);
        streams.status[source.name] = state?.status ?? 'idle';
        streams.connections[source.name] = state?.consumers.length ?? 0;
        streams.codecs[source.name] = nativeCodecs(this.go2rtcState.offers(name));
      }
      result.set(camera.id, streams);
    }

    return result;
  }

  private roomSize(room: string): number {
    return this.nsp.adapter.rooms.get(room)?.size ?? 0;
  }
}

function streamMaps(streams: Map<string, CameraStreams>): StreamMaps {
  const maps: StreamMaps = { status: {}, connections: {}, codecs: {} };
  for (const [cameraId, camera] of streams) {
    maps.status[cameraId] = camera.status;
    maps.connections[cameraId] = camera.connections;
    maps.codecs[cameraId] = camera.codecs;
  }
  return maps;
}

function deltaKey(camera: CameraStreams): DeltaKey {
  return { state: JSON.stringify([camera.status, camera.connections]), codecs: JSON.stringify(camera.codecs) };
}

function nativeCodecs(offers: Go2RTCOffers | undefined): StreamCodecs | undefined {
  if (!offers || offers.state === 'unknown') return undefined;
  return { video: offers.video.filter((codec) => codec.native), audio: offers.audio.filter((codec) => codec.native) };
}
