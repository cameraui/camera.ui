import { cpus, loadavg, platform } from 'node:os';
import { currentLoad, mem, processes } from 'systeminformation';
import { container } from 'tsyringe';

import { WorkerCapability } from '../../../workers/types.js';

import type { Namespace, Server, Socket } from 'socket.io';
import type { Systeminformation } from 'systeminformation';
import type { CameraUiAPI } from '../../../api.js';
import type { FrameWorkerPerfSnapshot } from '../../../camera/decoder/types.js';
import type { Go2Rtc } from '../../../go2rtc/index.js';
import type { PluginManager } from '../../../plugins/index.js';
import type { NATS } from '../../../rpc/server.js';
import type { WorkerManager } from '../../../workers/manager.js';
import type { AllProcesses, ProcessInfo, ProcessType, ServerProcesses, SocketNsp, WorkerDetectorStats, WorkerPerfStats, WorkerProcesses } from '../types.js';

export class MetricsNamespace {
  public nsp: Namespace;
  public nspName: SocketNsp = '/metrics';

  private readonly HISTORY_INTERVAL = 60000;
  private readonly REALTIME_INTERVAL = 5000;
  private readonly MAX_HISTORY_POINTS = 60;

  private api: CameraUiAPI;
  private pluginManager: PluginManager;
  private go2rtc: Go2Rtc;
  private natsServer: NATS;
  private workerManager: WorkerManager;

  private history = {
    system: [] as ProcessInfo[],
    processes: {
      'camera.ui': [] as ProcessInfo[],
      go2rtc: [] as ProcessInfo[],
      nats: [] as ProcessInfo[],
    },
    plugins: {} as WorkerProcesses,
    frameWorkers: {} as WorkerProcesses,
  };

  private realtimeData: { system: ProcessInfo | null; processes: AllProcesses | null } = {
    system: null,
    processes: null,
  };

  private workerPerf: Record<string, WorkerPerfStats> = {};

  constructor(io: Server) {
    this.api = container.resolve<CameraUiAPI>('api');
    this.pluginManager = container.resolve<PluginManager>('pluginManager');
    this.go2rtc = container.resolve<Go2Rtc>('go2rtc');
    this.natsServer = container.resolve<NATS>('natsServer');
    this.workerManager = container.resolve<WorkerManager>('workerManager');

    if (platform() === 'freebsd') {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      this.getSystemLoad = this.getSystemLoadAlt;
    }

    this.nsp = io.of(this.nspName);
    this.nsp.on('connection', (socket: Socket) => {
      socket.on('get-system-info', this.handleGetSystemInfo.bind(this));
      socket.on('get-server-process-info', this.handleGetServerProcessInfo.bind(this));
      socket.on('get-plugins-process-info', this.handleGetPluginsProcessInfo.bind(this));
      socket.on('get-frameworker-process-info', this.handleGetFrameWorkerProcessInfo.bind(this));

      if (this.realtimeData.system) {
        socket.emit('system-infos-realtime', this.realtimeData.system);
      }
      if (this.realtimeData.processes) {
        socket.emit('process-infos-realtime', this.realtimeData.processes);
      }
    });

    this.setupIntervals();
  }

  public snapshot(): { system: ProcessInfo | null; processes: AllProcesses | null } {
    return this.realtimeData;
  }

  private setupIntervals(): void {
    setInterval(async () => {
      await this.refreshWorkerPerf();

      let processData = this.realtimeData.processes;
      let systemData = this.realtimeData.system;

      if (!processData || !systemData) {
        [processData, systemData] = await Promise.all([this.collectProcessData(), this.getSystemLoad()]);
      } else {
        processData = this.withWorkerPerf(processData);
      }

      this.updateHistory(processData, systemData);
      this.emitHistoryUpdates(processData, systemData);
    }, this.HISTORY_INTERVAL);

    setInterval(async () => {
      if (this.hasConnectedClients()) await this.refreshWorkerPerf();
      const [collected, systemData] = await Promise.all([this.collectProcessData(), this.getSystemLoad()]);
      const processData = this.withWorkerPerf(collected);

      this.realtimeData = {
        system: systemData,
        processes: processData,
      };

      if (this.shouldUpdateHistory()) {
        this.updateHistory(processData, systemData);
      }

      this.emitRealtimeUpdates(processData, systemData);
    }, this.REALTIME_INTERVAL);

    this.collectInitialData();
  }

  private async refreshWorkerPerf(): Promise<void> {
    const controllers = this.api.getCameras();
    const next: Record<string, WorkerPerfStats> = {};

    await Promise.all(
      controllers.map(async (controller) => {
        const snapshot = await controller.frameWorker.getPerfSnapshot();
        if (snapshot && snapshot.uptimeMs > 0) {
          next[controller.frameWorker.name] = this.derivePerfStats(snapshot);
        }
      }),
    );

    this.workerPerf = next;
  }

  private pluginName(pluginId?: string): string | undefined {
    if (!pluginId) return undefined;
    for (const plugin of this.pluginManager.plugins.values()) {
      if (plugin.id === pluginId) return plugin.displayName ?? plugin.pluginName;
    }
    return pluginId;
  }

  private derivePerfStats(snapshot: FrameWorkerPerfSnapshot): WorkerPerfStats {
    const round = (value: number) => Math.round(value * 10) / 10;
    const per = (total: number, count: number) => (count > 0 ? round(total / count) : 0);
    const frames = snapshot.objectCount || snapshot.ticks;
    const loopSeconds = snapshot.loopMs / 1000;
    const activeSeconds = snapshot.ticks > 0 ? loopSeconds * (snapshot.activeTicks / snapshot.ticks) : 0;
    const fallback: Partial<Record<string, number>> = {
      motion: per(snapshot.motionMs, snapshot.motionCount),
      object: per(snapshot.objectMs, snapshot.objectCount),
      face: per(snapshot.faceMs, snapshot.faceCount),
      licensePlate: per(snapshot.plateMs, snapshot.plateCount),
      classifier: per(snapshot.classifierMs, snapshot.classifierCount),
      clip: per(snapshot.clipMs, snapshot.clipCount),
    };

    const detectors: Record<string, WorkerDetectorStats> = {};
    for (const [type, info] of Object.entries(snapshot.detectors)) {
      detectors[type] = {
        plugin: this.pluginName(info.plugin) ?? info.plugin,
        input: info.input,
        runtime: info.runtime,
        models: info.models,
        inferenceMs: info.calls ? per(info.handlerMs ?? 0, info.calls) : (fallback[type] ?? 0),
        transportMs: info.calls ? per(info.transportMs ?? 0, info.calls) : 0,
        stamped: Boolean(info.calls),
      };
    }

    return {
      detectors,
      processingMs: per(snapshot.scaleMs + snapshot.postMs, frames),
      decodeMs: per(snapshot.decodeMs, snapshot.decodedFrames),
      mainDecodeMs: per(snapshot.mainDecodeMs, snapshot.mainFrames),
      scaleMs: per(snapshot.scaleMs, frames),
      postMs: per(snapshot.postMs, frames),
      transportMs: detectors.object?.transportMs ?? 0,
      analysedFps: loopSeconds > 0 ? round(snapshot.ticks / loopSeconds) : 0,
      mainFps: activeSeconds > 0 ? round(snapshot.mainFrames / activeSeconds) : 0,
      mainStreamEnabled: snapshot.mainStreamEnabled,
      frameAnalysis: snapshot.frameAnalysis,
      activePercent: snapshot.uptimeMs > 0 ? Math.min(100, Math.round((snapshot.loopMs / snapshot.uptimeMs) * 100)) : 0,
      zoomPercent: snapshot.objectCount > 0 ? Math.min(100, Math.round((snapshot.zoomTicks / snapshot.objectCount) * 100)) : 0,
      zoomWindows: snapshot.zoomTicks > 0 ? round(snapshot.zoomWindows / snapshot.zoomTicks) : 0,
      objectsPerFrame: per(snapshot.objects, frames),
      hitPercent: frames > 0 ? Math.round((snapshot.framesWithObjects / frames) * 100) : 0,
      switches: snapshot.switches,
      minutes: Math.round(snapshot.uptimeMs / 60_000),
    };
  }

  private withWorkerPerf(processData: AllProcesses): AllProcesses {
    const workers = Object.fromEntries(
      Object.entries(processData.workers).map(([name, info]) => [name, this.workerPerf[name] ? { ...info, perf: this.workerPerf[name] } : info]),
    );
    return { ...processData, workers };
  }

  private async collectInitialData(): Promise<void> {
    await this.refreshWorkerPerf();
    const [collected, systemData] = await Promise.all([this.collectProcessData(), this.getSystemLoad()]);
    const processData = this.withWorkerPerf(collected);

    this.updateHistory(processData, systemData);
    this.realtimeData = {
      system: systemData,
      processes: processData,
    };
  }

  private async collectProcessData(): Promise<AllProcesses> {
    const allProcesses = await processes();
    const currentTime = Date.now();
    const processList = allProcesses.list;

    const createProcessInfo = (process: Systeminformation.ProcessesProcessData, name: string, type: ProcessType): ProcessInfo => ({
      name,
      type,
      pid: process.pid,
      cpuLoad: (process.cpu || 0.1).toFixed(2),
      memLoad: (process.mem || 0.1).toFixed(2),
      timestamp: currentTime,
    });

    const serverProcess = processList.find((p) => p.pid === process.pid);
    const go2rtcProcess = processList.find((p) => p.pid === this.go2rtc.getPID());
    const natsProcess = processList.find((p) => p.pid === this.natsServer.getPID());

    const plugins = Array.from(this.pluginManager.plugins);
    const pluginProcesses = Object.fromEntries(
      plugins
        .map(([name, plugin]) => {
          if (plugin.worker.isRemoteWorker) {
            const remote = this.remoteProcessInfo(WorkerCapability.PluginHost, name, name, 'plugin', currentTime);
            return remote ? [name, remote] : undefined;
          }

          const proc = processList.find((p) => p.pid === plugin.worker.getPID());
          return proc ? [name, createProcessInfo(proc, name, 'plugin')] : undefined;
        })
        .filter((entry): entry is [string, ProcessInfo] => entry !== undefined),
    );

    const cameraControllers = this.api.getCameras();
    const frameWorkerProcesses = Object.fromEntries(
      cameraControllers
        .map((controller) => {
          const frameWorker = controller.frameWorker;
          const name = frameWorker.name;
          let info: ProcessInfo | undefined;

          if (frameWorker.isRemoteWorker) {
            info = this.remoteProcessInfo(WorkerCapability.FrameDecoding, controller.id, name, 'frameworker', currentTime);
          } else {
            const proc = processList.find((p) => p.pid === frameWorker.getPID());
            info = proc ? createProcessInfo(proc, name, 'frameworker') : undefined;
          }

          if (!info) return null;
          if (this.workerPerf[name]) info.perf = this.workerPerf[name];
          return [name, info];
        })
        .filter((entry): entry is [string, ProcessInfo] => entry !== null),
    );

    return {
      'camera.ui': serverProcess ? createProcessInfo(serverProcess, 'camera.ui', 'core') : this.defaultProcessInfo('camera.ui', 'core'),
      go2rtc: go2rtcProcess ? createProcessInfo(go2rtcProcess, 'go2rtc', 'core') : this.defaultProcessInfo('go2rtc', 'core'),
      nats: natsProcess ? createProcessInfo(natsProcess, 'nats', 'core') : this.defaultProcessInfo('nats', 'core'),
      plugins: pluginProcesses,
      workers: frameWorkerProcesses,
    };
  }

  // a workload on a remote worker has no local process: cpu/memory come from
  // the agent's heartbeat, and the row stays even before the first sample
  private remoteProcessInfo(capability: WorkerCapability, id: string, name: string, type: ProcessType, timestamp: number): ProcessInfo | undefined {
    const remote = this.workerManager.getRemoteProcess(capability, id);
    if (!remote) return undefined;

    return {
      name,
      type,
      worker: remote.worker,
      pid: remote.sample?.pid ?? -1,
      cpuLoad: remote.sample?.cpuLoad ?? '0.00',
      memLoad: remote.sample?.memLoad ?? '0.00',
      timestamp,
    };
  }

  private async getSystemLoad(): Promise<ProcessInfo> {
    const load = (await currentLoad()).currentLoad;
    const memory = await mem();
    const memoryFreePercent = ((memory.total - memory.available) / memory.total) * 100;

    return {
      name: 'system',
      type: 'system',
      cpuLoad: load.toFixed(2),
      memLoad: memoryFreePercent.toFixed(2),
      timestamp: Date.now(),
    };
  }

  private async getSystemLoadAlt(): Promise<ProcessInfo> {
    const load = (loadavg()[0] * 100) / cpus().length;
    const memory = await mem();
    const memoryFreePercent = ((memory.total - memory.available) / memory.total) * 100;

    return {
      name: 'system',
      type: 'system',
      cpuLoad: load.toFixed(2),
      memLoad: memoryFreePercent.toFixed(2),
      timestamp: Date.now(),
    };
  }

  private updateHistory(processData: AllProcesses, systemData: ProcessInfo): void {
    this.history.system.push(systemData);
    this.history.system = this.history.system.slice(-this.MAX_HISTORY_POINTS);

    if (processData['camera.ui']) {
      this.history.processes['camera.ui'].push(processData['camera.ui']);
      this.history.processes['camera.ui'] = this.history.processes['camera.ui'].slice(-this.MAX_HISTORY_POINTS);
    }
    if (processData.go2rtc) {
      this.history.processes.go2rtc.push(processData.go2rtc);
      this.history.processes.go2rtc = this.history.processes.go2rtc.slice(-this.MAX_HISTORY_POINTS);
    }
    if (processData.nats) {
      this.history.processes.nats.push(processData.nats);
      this.history.processes.nats = this.history.processes.nats.slice(-this.MAX_HISTORY_POINTS);
    }

    Object.entries(processData.plugins || {}).forEach(([name, info]) => {
      if (!this.history.plugins[name]) {
        this.history.plugins[name] = [];
      }
      this.history.plugins[name].push(info);
      this.history.plugins[name] = this.history.plugins[name].slice(-this.MAX_HISTORY_POINTS);
    });

    Object.entries(processData.workers || {}).forEach(([name, info]) => {
      if (!this.history.frameWorkers[name]) {
        this.history.frameWorkers[name] = [];
      }
      this.history.frameWorkers[name].push(info);
      this.history.frameWorkers[name] = this.history.frameWorkers[name].slice(-this.MAX_HISTORY_POINTS);
    });

    this.cleanupOrphanedEntries(processData);
  }

  private cleanupOrphanedEntries(currentData: AllProcesses): void {
    Object.keys(this.history.plugins).forEach((name) => {
      if (!currentData.plugins?.[name]) {
        delete this.history.plugins[name];
      }
    });

    Object.keys(this.history.frameWorkers).forEach((name) => {
      if (!currentData.workers?.[name]) {
        delete this.history.frameWorkers[name];
      }
    });
  }

  private emitHistoryUpdates(processData: AllProcesses, systemData: ProcessInfo): void {
    if (!this.hasConnectedClients()) {
      return;
    }

    this.nsp.emit('process-infos', processData);
    this.nsp.emit('system-infos', systemData);
  }

  private emitRealtimeUpdates(processData: AllProcesses, systemData: ProcessInfo): void {
    if (!this.hasConnectedClients()) {
      return;
    }

    this.nsp.emit('process-infos-realtime', processData);
    this.nsp.emit('system-infos-realtime', systemData);
  }

  private async handleGetSystemInfo(_payload: any, callback?: Function): Promise<ProcessInfo[]> {
    callback?.(this.history.system);
    return this.history.system;
  }

  private async handleGetServerProcessInfo(_payload: any, callback?: Function): Promise<ServerProcesses> {
    const data: ServerProcesses = {
      'camera.ui': this.history.processes['camera.ui'],
      go2rtc: this.history.processes.go2rtc,
      nats: this.history.processes.nats,
    };
    callback?.(data);
    return data;
  }

  private async handleGetPluginsProcessInfo(_payload: any, callback?: Function): Promise<WorkerProcesses> {
    callback?.(this.history.plugins);
    return this.history.plugins;
  }

  private async handleGetFrameWorkerProcessInfo(_payload: any, callback?: Function): Promise<WorkerProcesses> {
    callback?.(this.history.frameWorkers);
    return this.history.frameWorkers;
  }

  private hasConnectedClients(): boolean {
    return this.nsp.sockets.size > 0;
  }

  private defaultProcessInfo(name: string, type: ProcessType): ProcessInfo {
    return {
      name,
      type,
      pid: -1,
      cpuLoad: '0.00',
      memLoad: '0.00',
      timestamp: 0,
    };
  }

  private shouldUpdateHistory(): boolean {
    return (
      (Object.keys(this.history.plugins).length === 0 && this.pluginManager.plugins.size > 0) ||
      (Object.keys(this.history.frameWorkers).length === 0 && this.api.getCameras().length > 0)
    );
  }
}
