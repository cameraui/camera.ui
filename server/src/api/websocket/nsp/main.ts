import { container } from 'tsyringe';

import { createSourceName } from '../../../utils/camera.js';

import type { Namespace, Server, Socket } from 'socket.io';
import type { CameraUiAPI } from '../../../api.js';
import type { Go2RtcState } from '../../../go2rtc/state.js';
import type { Go2RTCOfferCodec, Go2RTCOffers, StreamStatus } from '../../../go2rtc/types.js';
import type { CameraUi } from '../../../main.js';
import type { SocketNsp } from '../types.js';

interface StreamCodecs {
  video: Go2RTCOfferCodec[];
  audio: Go2RTCOfferCodec[];
}

export class MainNamespace {
  public nsp: Namespace;
  public nspName: SocketNsp = '/camera.ui';

  private cameraui: CameraUi;
  private api: CameraUiAPI;
  private go2rtcState: Go2RtcState;
  private broadcastTimer?: NodeJS.Timeout;

  constructor(io: Server) {
    this.cameraui = container.resolve<CameraUi>('cameraui');
    this.api = container.resolve<CameraUiAPI>('api');
    this.go2rtcState = container.resolve<Go2RtcState>('go2rtcState');

    this.nsp = io.of(this.nspName);
    this.nsp.on('connection', (socket: Socket) => {
      socket.on('get-status', this.getStatus.bind(this));

      socket.on('get-stream-status', () => {
        socket.emit('stream-status', this.streamStatus());
        socket.emit('stream-connections', this.streamConnections());
        socket.emit('stream-codecs', this.streamCodecs());
      });
    });

    this.go2rtcState.on('stream', () => this.scheduleBroadcast());
    this.go2rtcState.on('snapshot', () => this.scheduleBroadcast());
  }

  public async getStatus(_payload: any, callback?: Function): Promise<'loading' | 'ready'> {
    const status = this.cameraui.status;
    callback?.(status);
    return status;
  }

  private scheduleBroadcast(): void {
    if (this.broadcastTimer) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = undefined;
      this.nsp.emit('stream-status', this.streamStatus());
      this.nsp.emit('stream-connections', this.streamConnections());
      this.nsp.emit('stream-codecs', this.streamCodecs());
    }, 100);
  }

  private streamStatus(): Record<string, Record<string, StreamStatus>> {
    return this.perSource((name) => this.go2rtcState.get(name)?.status ?? 'idle');
  }

  private streamConnections(): Record<string, Record<string, number>> {
    return this.perSource((name) => this.go2rtcState.get(name)?.consumers.length ?? 0);
  }

  private streamCodecs(): Record<string, Record<string, StreamCodecs | undefined>> {
    return this.perSource((name) => nativeCodecs(this.go2rtcState.offers(name)));
  }

  private perSource<T>(value: (streamName: string) => T): Record<string, Record<string, T>> {
    const result: Record<string, Record<string, T>> = {};

    for (const camera of this.api.getCameras()) {
      const sources: Record<string, T> = {};
      for (const source of camera.sources) {
        if (source.role === 'snapshot') {
          continue;
        }
        sources[source.name] = value(createSourceName(camera.name, source.name));
      }
      result[camera.id] = sources;
    }

    return result;
  }
}

function nativeCodecs(offers: Go2RTCOffers | undefined): StreamCodecs | undefined {
  if (!offers || offers.state === 'unknown') return undefined;
  return { video: offers.video.filter((codec) => codec.native), audio: offers.audio.filter((codec) => codec.native) };
}
