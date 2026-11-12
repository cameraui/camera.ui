import { inject } from '../../../container.js';
import { RUNTIME_STATUS } from '../../../services/config/types.js';
import { onClientEvent } from '../client-events.js';

import type { Namespace, Server, Socket } from 'socket.io';
import type { CameraUiAPI } from '../../../api.js';
import type { Go2Rtc } from '../../../go2rtc/index.js';
import type { PluginManager } from '../../../plugins/index.js';
import type { NATS } from '../../../rpc/server.js';
import type { ConfigService } from '../../../services/config/index.js';
import type { ServerRuntime, SocketNsp, WorkerRuntime } from '../types.js';

export class StatusNamespace {
  public nsp: Namespace;
  public nspName: SocketNsp = '/status';

  private api: CameraUiAPI;
  private configService: ConfigService;
  private pluginManager: PluginManager;
  private go2rtc: Go2Rtc;
  private natsServer: NATS;

  constructor(io: Server) {
    this.api = inject('api');
    this.configService = inject('configService');
    this.pluginManager = inject('pluginManager');
    this.go2rtc = inject('go2rtc');
    this.natsServer = inject('natsServer');

    this.nsp = io.of(this.nspName);
    this.nsp.on('connection', (socket: Socket) => {
      onClientEvent(socket, 'get-process-status', this.watchStats.bind(this, socket));
      onClientEvent(socket, 'get-plugin-process-status', this.watchPluginStats.bind(this, socket));
      onClientEvent(socket, 'get-frameworker-process-status', this.watchFrameWorkerStats.bind(this, socket));
    });
  }

  public watchStats(socket: Socket, _payload: any, callback?: (data: ServerRuntime) => void): ServerRuntime {
    const runtimeStatus: ServerRuntime = {
      'camera.ui': { name: 'camera.ui', status: RUNTIME_STATUS.STARTED },
      go2rtc: { name: 'go2rtc', status: this.go2rtc.status },
      nats: { name: 'nats', status: this.natsServer.status },
    };

    socket.emit('process-status', runtimeStatus);

    callback?.(runtimeStatus);
    return runtimeStatus;
  }

  public watchPluginStats(socket: Socket, _payload: any, callback?: (data: WorkerRuntime) => void): WorkerRuntime {
    const pluginWorkers: WorkerRuntime = {};

    Array.from(this.pluginManager.plugins).map(([pluginName, plugin]) => {
      pluginWorkers[pluginName] = { name: pluginName, status: plugin.worker.status, placement: plugin.worker.placementInfo };
    });

    socket.emit('plugin-process-status', pluginWorkers);

    callback?.(pluginWorkers);
    return pluginWorkers;
  }

  public watchFrameWorkerStats(socket: Socket, _payload: any, callback?: (data: WorkerRuntime) => void): WorkerRuntime {
    const frameWorkers: WorkerRuntime = {};

    const cameraControllers = this.api.getCameras();
    cameraControllers.forEach((cameraController) => {
      const frameWorker = cameraController.frameWorker;
      frameWorkers[frameWorker.name] = { name: frameWorker.name, status: frameWorker.status, placement: frameWorker.placementInfo };
    });

    socket.emit('frameworker-process-status', frameWorkers);

    callback?.(frameWorkers);
    return frameWorkers;
  }
}
