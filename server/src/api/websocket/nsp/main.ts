import { container } from 'tsyringe';

import { createSourceName } from '../../../utils/camera.js';

import type { Namespace, Server, Socket } from 'socket.io';
import type { CameraUiAPI } from '../../../api.js';
import type { Go2RtcApi } from '../../../go2rtc/api/index.js';
import type { StreamStatus } from '../../../go2rtc/types.js';
import type { CameraUi } from '../../../main.js';
import type { SocketNsp } from '../types.js';

export class MainNamespace {
  public nsp: Namespace;
  public nspName: SocketNsp = '/camera.ui';

  private cameraui: CameraUi;
  private api: CameraUiAPI;
  private go2rtcApi: Go2RtcApi;

  constructor(io: Server) {
    this.cameraui = container.resolve<CameraUi>('cameraui');
    this.api = container.resolve<CameraUiAPI>('api');
    this.go2rtcApi = container.resolve<Go2RtcApi>('go2rtcApi');

    this.nsp = io.of(this.nspName);
    this.nsp.on('connection', (socket: Socket) => {
      socket.on('get-status', this.getStatus.bind(this));

      socket.on('get-stream-status', () => {
        this.handleGetStreamStatus(socket);
      });
    });
  }

  public async getStatus(_payload: any, callback?: Function): Promise<'loading' | 'ready'> {
    const status = this.cameraui.status;
    callback?.(status);
    return status;
  }

  private async handleGetStreamStatus(socket: Socket): Promise<void> {
    let statuses: Record<string, StreamStatus> = {};
    try {
      statuses = await this.go2rtcApi.streamsRoute.getStreamsStatus();
    } catch {
      // Silent catch — UI shows everything as idle
    }

    const cameras = this.api.getCameras();
    const result: Record<string, Record<string, StreamStatus>> = {};

    for (const camera of cameras) {
      const cameraStatuses: Record<string, StreamStatus> = {};
      for (const source of camera.sources) {
        if (source.role === 'snapshot') {
          continue;
        }
        const sourceName = createSourceName(camera.name, source.name);
        cameraStatuses[source.name] = statuses[sourceName] ?? 'idle';
      }
      result[camera.id] = cameraStatuses;
    }

    socket.emit('stream-status', result);
  }
}
