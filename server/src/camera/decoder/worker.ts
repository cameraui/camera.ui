import { Logger } from '@camera.ui/common/logger';
import { IS_DEV, IS_ELECTRON, isEqual, sleep, Subscribed } from '@camera.ui/common/utils';
import { Disposable } from '@camera.ui/sdk';
import { fork } from 'node:child_process';

import { inject } from '../../container.js';
import { isNvrPluginName, nvrRpcNamespace } from '../../plugins/nvr.js';
import { PLUGIN_STATUS } from '../../plugins/types.js';
import { NamespaceManager } from '../../rpc/namespaces.js';
import { isShuttingDown } from '../../shutdown-state.js';
import { nodeDecoderPath } from '../../utils/path.js';
import { exitInfo } from '../../utils/process-exit.js';
import { DECODER_STOP_BUDGET_MS, SupervisedChild, supervisedSpawn } from '../../utils/supervised-child.js';
import { LocalStartAbandoned, RemotePlacement } from '../../workers/lifecycle/remote-placement.js';
import { WORKER_PROTOCOL, WorkerCapability } from '../../workers/types.js';

import type { LogEntry } from '@camera.ui/common/logger';
import type { PrivateChannel, Promisify } from '@camera.ui/rpc';
import type {
  CameraDetectionSettings,
  CameraFrameWorkerSettings,
  CameraInput,
  CameraUiSettings,
  CameraZones,
  FrameWorkerDecoderSettings,
  PtzAutotrackSettings,
  StreamingRole,
} from '@camera.ui/sdk';
import type { ChildProcess } from 'node:child_process';
import type { SocketService } from '../../api/websocket/index.js';
import type { WorkerRuntime } from '../../api/websocket/types.js';
import type { InternalEventPayload, PluginEventPayload } from '../../internal-bus.js';
import type { ProxyServer } from '../../rpc/index.js';
import type { FrameWorkerChildInterface } from '../../rpc/interfaces/frameworker.js';
import type { FrameWorkerNamespaces } from '../../rpc/namespaces.js';
import type { ConfigService } from '../../services/config/index.js';
import type { LogManager } from '../../services/logger/logManager.js';
import type { PlacementInfo } from '../../workers/lifecycle/remote-placement.js';
import type { WorkerManager } from '../../workers/manager.js';
import type { CameraController } from '../controller.js';
import type { CoordinatorSourceUrl, FrameWorkerPerfSnapshot, MainToWorkerMessage, ObjectBenchmarkResult, WorkerToMainMessage } from './types.js';

const READY_TIMEOUT_MS = 30_000;

interface CameraChange {
  property: string;
  oldData: unknown;
  newData: unknown;
}

export class FrameWorker extends Subscribed {
  private readonly configService: ConfigService;
  private readonly socketService: SocketService;
  private readonly proxyServer: ProxyServer;
  private readonly logManager: LogManager;
  private readonly workerManager: WorkerManager;

  private isClosed = false;
  private isRestarting = false;
  private stopping = false;
  private process?: ChildProcess;
  private supervised?: SupervisedChild;
  private localBound?: string;
  private announcedInstance?: string;
  private retryTimeout?: NodeJS.Timeout;
  private readyTimeout?: NodeJS.Timeout;
  private settleStart?: (error?: Error) => void;
  private channel?: PrivateChannel;
  private channelOpening?: Promise<void>;
  private ended = false;
  private deferredChanges = new Map<string, CameraChange>();
  private nvrRpcStale = false;
  private placement: RemotePlacement;
  private namespaces: FrameWorkerNamespaces;
  private _status: PLUGIN_STATUS = PLUGIN_STATUS.UNKNOWN;

  private readonly logger: Logger;
  private logBuffer = '';
  private opQueue: Promise<unknown> = Promise.resolve();

  public get name(): string {
    return this.camera.name;
  }

  public get status(): PLUGIN_STATUS {
    return this._status;
  }

  public get isRemoteWorker(): boolean {
    const host = this.placement.host;
    return host !== undefined && host !== 'master';
  }

  public get placementInfo(): PlacementInfo {
    return this.placement.info;
  }

  public get boundInstance(): string | undefined {
    return this.placement.phase === 'local' ? this.localBound : this.placement.handshakeInstance;
  }

  constructor(private readonly camera: CameraController) {
    super();

    this.configService = inject('configService');
    this.socketService = inject('socketService');
    this.proxyServer = inject('proxy');
    this.logManager = inject('logManager');
    this.workerManager = inject('workerManager');

    this.logger = (camera.logger as Logger).createLogger({
      prefix: 'Frame Worker',
      suffix: camera.name,
      targetId: camera.id,
      targetType: 'camera',
    });

    this.namespaces = NamespaceManager.frameWorkerNamespaces(camera.id);

    this.placement = new RemotePlacement(
      WorkerCapability.FrameDecoding,
      camera.id,
      `camera ${camera.name}`,
      {
        runLocal: (reason) => this.runLocal(reason),
        stopLocal: (reason) => {
          // a start waiting for the local child would hold the queue until its ready timeout
          this.settleStart?.(new LocalStartAbandoned(reason));
          return this.enqueue(() => this.stopLocal(reason));
        },
        handshake: (instanceId) => this.initializeChild(instanceId),
        resume: (instanceId) => this.sendResume(instanceId),
        lost: (reason) => this.logger.debug(`Frame Worker lost its instance: ${reason}`),
        changed: (info) => this.onPlacementChanged(info),
      },
      this.logger,
      () => this.workerManager,
    );

    this.setupEventListeners();
  }

  public start(): Promise<void> {
    return this.enqueue(() => this.doStart());
  }

  public stop(): Promise<void> {
    return this.enqueue(() => this.doStop());
  }

  public close(): Promise<void> {
    this.isClosed = true;
    clearTimeout(this.retryTimeout);
    this.retryTimeout = undefined;
    return this.enqueue(() => this.doClose());
  }

  public restart(): Promise<void> {
    return this.enqueue(() => this.doRestart());
  }

  public destroy(): Promise<void> {
    this.isClosed = true;
    clearTimeout(this.retryTimeout);
    this.retryTimeout = undefined;
    return this.enqueue(async () => {
      await this.doClose();
      this.ended = true;
      this.placement.close();
      if (!isShuttingDown()) {
        await this.channel?.close();
      }
      this.channel = undefined;
      this.unsubscribe();
    });
  }

  private enqueue<T>(op: () => Promise<T>): Promise<T> {
    const run = this.opQueue.then(op, op);
    this.opQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private get busy(): boolean {
    const phase = this.placement.phase;
    if (phase === 'local') {
      return !!this.process;
    }
    return phase !== 'idle' && phase !== 'releasing' && phase !== 'failed';
  }

  private async doStart(): Promise<void> {
    if (this.busy) {
      return;
    }

    if (this.camera.disabled) {
      this.logger.debug('Camera is disabled, worker will not start');
      return;
    }

    if (this.camera.snooze) {
      this.logger.debug('Camera is snoozed, worker will not start');
      return;
    }

    this.isClosed = false;
    this.isRestarting = false;
    this.stopping = false;
    clearTimeout(this.retryTimeout);
    this.retryTimeout = undefined;

    if (!this.camera.connected) {
      this.logger.debug('Camera not connected, worker starts on the next connect');
      return;
    }

    try {
      this.setStatus(PLUGIN_STATUS.STARTING);
      await this.ensureChannel();
      if (this.placement.place('start') === 'local') {
        await this.startLocal();
      }
    } catch (error) {
      if (error instanceof LocalStartAbandoned) {
        return;
      }
      this.setStatus(PLUGIN_STATUS.ERROR);
      this.logger.error('Failed to start worker:', error);
    }
  }

  private async doStop(): Promise<void> {
    // on shutdown the remote instance and its channel stay, the next run takes them over
    if (isShuttingDown() && this.placement.remote) {
      this.placement.detach();
      return;
    }

    if (this.status === PLUGIN_STATUS.STOPPED || this.status === PLUGIN_STATUS.STOPPING) {
      return;
    }

    this.logger.log('Stopping Frame Worker');
    this.stopping = true;
    clearTimeout(this.readyTimeout);
    this.readyTimeout = undefined;

    switch (this.placement.stop()) {
      case 'local':
        this.setStatus(PLUGIN_STATUS.STOPPING);
        await this.terminateProcess();
        this.clearProcessState();
        break;
      case 'stopped':
        this.setStatus(PLUGIN_STATUS.STOPPED);
        break;
      case 'releasing':
        break;
    }
  }

  private async doClose(): Promise<void> {
    this.logger.trace('Closing Frame Worker');

    this.isClosed = true;
    this.isRestarting = false;
    clearTimeout(this.retryTimeout);
    this.retryTimeout = undefined;
    clearTimeout(this.readyTimeout);
    this.readyTimeout = undefined;

    await this.doStop();
    this.logBuffer = '';
  }

  private async doRestart(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    // a new instance on the same worker, the status follows the placement
    const host = this.placement.host;
    if (host && host !== 'master' && this.placement.phase !== 'failed') {
      this.placement.restart('restart requested');
      return;
    }

    this.logger.debug('Restarting Frame Worker...');
    this.isRestarting = true;

    await this.doStop();
    await sleep(2000);
    await this.doStart();
  }

  private runLocal(reason: string): void {
    this.logger.log(`Decoding on this server: ${reason}`);
    this.enqueue(async () => {
      if (this.placement.phase !== 'local' || this.process || this.isClosed || !this.camera.connected) {
        return;
      }
      this.stopping = false;
      this.setStatus(PLUGIN_STATUS.STARTING);
      await this.startLocal();
    }).catch((error) => {
      if (error instanceof LocalStartAbandoned) {
        return;
      }
      this.setStatus(PLUGIN_STATUS.ERROR);
      this.logger.error('Failed to start worker:', error);
    });
  }

  private async stopLocal(reason: string): Promise<void> {
    clearTimeout(this.readyTimeout);
    this.readyTimeout = undefined;
    if (!this.process) {
      return;
    }

    this.logger.log(`Stopping Frame Worker (${reason})`);
    this.stopping = true;
    await this.terminateProcess();
    this.clearProcessState();
  }

  private async ensureChannel(): Promise<void> {
    if (this.ended || (this.channel && !this.channel.isClosed)) {
      return;
    }
    this.channelOpening ??= (async () => {
      const channel = await this.proxyServer.proxy.privateChannel('frameworker-communication', this.namespaces.frameWorkerChild);
      channel.on('message', (message: WorkerToMainMessage) => this.handleWorkerMessage(message));
      channel.on('close', () => this.onChannelClose(channel));
      this.channel = channel;
    })().finally(() => {
      this.channelOpening = undefined;
    });
    await this.channelOpening;
  }

  private onChannelClose(channel: PrivateChannel): void {
    if (this.channel !== channel || this.ended || isShuttingDown()) {
      return;
    }
    this.channel = undefined;
    this.ensureChannel().catch((error) => this.logger.warn('Could not reopen the Frame Worker channel:', error));
  }

  private onPlacementChanged(info: PlacementInfo): void {
    switch (info.phase) {
      case 'local':
        break;
      case 'pending':
      case 'provisioning':
      case 'spawned':
      case 'adopting':
      case 'handshaking':
      case 'restarting':
      case 'held':
      case 'waiting-for-worker':
        this.setStatus(PLUGIN_STATUS.STARTING, info);
        break;
      case 'bound':
        if (info.instanceId !== this.announcedInstance) {
          this.announcedInstance = info.instanceId;
          this.logger.log(`Frame Worker ready on worker ${info.worker}`);
        }
        this.setStatus(PLUGIN_STATUS.STARTED, info);
        break;
      case 'releasing':
        this.setStatus(PLUGIN_STATUS.STOPPING, info);
        break;
      case 'failed':
        this.setStatus(PLUGIN_STATUS.ERROR, info);
        break;
      case 'idle':
        this.setStatus(PLUGIN_STATUS.STOPPED, info);
        break;
    }
  }

  public getPID(): number {
    return this.process?.pid ?? -1;
  }

  public async getPerfSnapshot(): Promise<FrameWorkerPerfSnapshot | null> {
    if (this.status !== PLUGIN_STATUS.STARTED) {
      return null;
    }

    try {
      return await this.frameWorkerChildProxy.getPerfSnapshot();
    } catch {
      return null;
    }
  }

  public async resetPerf(): Promise<void> {
    if (this.status !== PLUGIN_STATUS.STARTED) return;

    try {
      await this.frameWorkerChildProxy.resetPerf();
    } catch {
      // ignore
    }
  }

  public async pauseForBenchmark(paused: boolean): Promise<void> {
    if (this.status !== PLUGIN_STATUS.STARTED) return;

    try {
      await this.frameWorkerChildProxy.pauseForBenchmark(paused);
    } catch {
      // ignore
    }
  }

  public async runObjectBenchmark(iterations: number, concurrency: number): Promise<ObjectBenchmarkResult | null> {
    if (this.status !== PLUGIN_STATUS.STARTED) return null;

    try {
      return await this.frameWorkerChildProxy.runObjectBenchmark(iterations, concurrency);
    } catch {
      return null;
    }
  }

  private setupEventListeners(): void {
    this.addSubscriptions(
      this.camera
        .onPropertyChange(['name', 'sources', 'detectionSettings', 'ptzAutotrack', 'zones', 'frameWorkerSettings', 'interfaceSettings'])
        .subscribe((change) => this.onCameraChange(change)),

      this.camera.onConnected.subscribe((connected) => {
        if (connected) {
          if (!this.isClosed) {
            this.start();
          }
        } else {
          this.stop();
        }
      }),
    );

    const bus = inject('internalBus');
    for (const event of ['plugin:started', 'plugin:stopped', 'plugin:crashed'] as const) {
      const handler = (payload: InternalEventPayload): void => {
        if (!isNvrPluginName((payload as PluginEventPayload).pluginName)) return;
        if (this.status === PLUGIN_STATUS.STARTED) {
          this.pushNvrRpc();
        } else if (this.status === PLUGIN_STATUS.STARTING) {
          this.nvrRpcStale = true;
        }
      };
      bus.onEvent(event, handler);
      this.addSubscriptions(new Disposable(() => bus.offEvent(event, handler)));
    }
  }

  private onCameraChange(change: CameraChange): void {
    const { property, newData, oldData } = change;

    if (property === 'name') {
      this.logger.suffix = this.camera.name;
      this.placement.label = `camera ${this.camera.name}`;
      if (this.isRemoteWorker) {
        this.workerManager.refreshLive(WorkerCapability.FrameDecoding, this.camera.id);
      }
      if (this.status === PLUGIN_STATUS.STARTED) {
        this.pushChildUpdate('name', this.frameWorkerChildProxy.updateCameraName(this.camera.name));
      } else {
        this.deferChange(change);
      }
      return;
    }

    if (this.status !== PLUGIN_STATUS.STARTED) {
      this.deferChange(change);
      return;
    }

    if (property === 'sources') {
      const newSource = (newData as CameraInput[]).map((source) => ({
        name: source.name,
        urls: source.urls,
        role: source.role,
      }));

      const oldSource = (oldData as CameraInput[]).map((source) => ({
        name: source.name,
        urls: source.urls,
        role: source.role,
      }));

      if (isEqual(newSource, oldSource)) {
        return;
      }

      this.restart();
      return;
    }

    if (property === 'frameWorkerSettings') {
      const newSettings = newData as CameraFrameWorkerSettings;
      const oldSettings = oldData as CameraFrameWorkerSettings;
      if (!isEqual(this.effectiveDecoder(newSettings), this.effectiveDecoder(oldSettings), true)) {
        this.restart();
        return;
      }
      this.pushChildUpdate('frame worker settings', this.frameWorkerChildProxy.updateFrameWorkerSettings(this.resolveFrameWorkerSettings(newSettings)));
      return;
    }

    if (property === 'detectionSettings') {
      const newSettings = newData as CameraDetectionSettings;
      if (newSettings.snooze !== (oldData as CameraDetectionSettings).snooze) {
        return;
      }
      this.pushChildUpdate('detection settings', this.frameWorkerChildProxy.updateDetectionSettings(newSettings));
      return;
    }

    if (property === 'ptzAutotrack') {
      this.pushChildUpdate('autotrack settings', this.frameWorkerChildProxy.updatePtzAutotrackSettings(newData as PtzAutotrackSettings));
      return;
    }

    if (property === 'zones') {
      this.pushChildUpdate('zones', this.frameWorkerChildProxy.updateZoneConfig(newData as CameraZones));
      return;
    }

    if (property === 'interfaceSettings') {
      this.pushChildUpdate('interface settings', this.frameWorkerChildProxy.updateInterfaceSettings(newData as CameraUiSettings));
    }
  }

  private deferChange(change: CameraChange): void {
    if (this.status !== PLUGIN_STATUS.STARTING) {
      return;
    }
    const queued = this.deferredChanges.get(change.property);
    this.deferredChanges.set(change.property, queued ? { ...change, oldData: queued.oldData } : change);
  }

  private catchUpChild(): void {
    if (this.nvrRpcStale) {
      this.pushNvrRpc();
    }
    const changes = [...this.deferredChanges.values()];
    this.deferredChanges.clear();
    for (const change of changes) {
      this.onCameraChange(change);
    }
  }

  private startLocal(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.settleStart = (error?: Error) => {
        clearTimeout(this.readyTimeout);
        this.readyTimeout = undefined;
        this.settleStart = undefined;

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      try {
        this.localBound = undefined;
        this.armReadyTimeout();
        this.forkLocal();
      } catch (error) {
        this.settleStart?.(error as Error);
      }
    });
  }

  private armReadyTimeout(): void {
    clearTimeout(this.readyTimeout);

    this.readyTimeout = setTimeout(() => {
      if (!this.settleStart) {
        return;
      }

      this.logger.error(`Frame Worker did not report ready within ${READY_TIMEOUT_MS / 1000}s`);
      this.setStatus(PLUGIN_STATUS.ERROR);
      this.supervised?.kill();
      this.settleStart?.(new Error('Frame Worker did not report ready'));
      this.attemptRestart();
    }, READY_TIMEOUT_MS);
  }

  private forkLocal(): void {
    this.logger.debug('Starting Frame Worker');
    this.logger.trace('Worker path:', nodeDecoderPath);

    const supervision = supervisedSpawn(DECODER_STOP_BUDGET_MS, { env: this.buildWorkerEnv() });
    const processName = `camera.ui - Frame Worker [${this.camera.name}]`;

    this.process = fork(nodeDecoderPath, [processName], {
      env: {
        ...process.env,
        ...supervision.env,
      },
      silent: true,
      detached: supervision.detached,
      windowsHide: supervision.windowsHide,
      execArgv: IS_DEV && !IS_ELECTRON ? ['--import=tsx'] : undefined,
    });
    this.supervised = new SupervisedChild(this.process, supervision, {
      role: 'frame',
      command: process.execPath,
      args: [processName],
      titles: [processName, 'camera.ui - Frame Worker'],
    });

    this.setupProcessListeners();
  }

  private async terminateProcess(): Promise<void> {
    const exit = await this.supervised?.stop();
    if (this.supervised && !exit) {
      this.logger.warn('Frame Worker did not exit after the kill');
    }
    this.setStatus(PLUGIN_STATUS.STOPPED);
  }

  private setupProcessListeners(): void {
    const child = this.process;
    if (!child) {
      return;
    }

    child.once('spawn', () => {
      this.logger.log(`Process started with PID: ${child.pid}`);
    });

    child.on('error', (error) => {
      this.setStatus(PLUGIN_STATUS.ERROR);
      this.logger.error('Frame Worker reported an error!', error);
    });

    child.once('exit', (code, signal) => {
      const intentional = this.stopping || this.isClosed || isShuttingDown();
      const details = exitInfo(code, signal, { pid: child.pid });

      if (intentional) {
        this.logger.log(`Frame Worker exited (${details})`);
      } else {
        this.logger.error(`Frame Worker exited unexpectedly (${details})`);
      }

      this.settleStart?.(new Error(`Frame Worker exited before it was ready (${details})`));
      if (this.process === child) {
        this.clearProcessState();
      }

      // moved to a worker meanwhile, the placement owns the status
      if (this.placement.phase !== 'local') {
        return;
      }
      this.setStatus(PLUGIN_STATUS.STOPPED);
      this.attemptRestart();
    });

    child.stdout?.on('data', (data) => this.handleLogData(data));
    child.stderr?.on('data', (data) => this.handleLogData(data));
  }

  private sendResume(instanceId: string): void {
    if (!this.channel || this.channel.isClosed) {
      return;
    }
    this.channel
      .send<MainToWorkerMessage>({ message: 'resume', data: { runId: this.workerManager.runId, instanceId } })
      .catch((error) => this.logger.debug('Could not send resume to the Frame Worker:', error));
  }

  private handleWorkerMessage(message: WorkerToMainMessage): void {
    if (message.message !== 'started') {
      return;
    }

    if (this.placement.ready(message.instanceId, message.data?.handshake)) {
      return;
    }

    // only the child this server forked, older decoders send no id
    const own = this.supervised?.instanceId;
    if (!this.process || this.localBound || (message.instanceId && message.instanceId !== own)) {
      this.logger.debug(`Ignored 'started' of instance ${message.instanceId ?? '(none)'}`);
      return;
    }
    this.localBound = own;
    this.initializeChild(own);
  }

  private async initializeChild(instanceId: string | undefined): Promise<void> {
    const remote = this.placement.phase !== 'local';
    if (!remote) {
      this.armReadyTimeout();
    }

    let source = this.getVideoSource();
    let audioSource = this.getAudioSource();
    let snapshotSource = this.getSnapshotSource();
    let availableSources = this.getAvailableSources();

    if (remote) {
      source = this.rewriteForRemote(source);
      audioSource = this.rewriteForRemote(audioSource);
      snapshotSource = this.rewriteForRemote(snapshotSource);
      availableSources = availableSources.map((s) => ({ ...s, url: this.rewriteForRemote(s.url) }));
    }

    // initialize sends the current values, only later changes need the catch-up
    this.deferredChanges.clear();
    this.nvrRpcStale = false;

    try {
      await this.frameWorkerChildProxy.initialize({
        cameraId: this.camera.id,
        streamUrl: source,
        snapshotUrl: snapshotSource,
        audioStreamUrl: audioSource,
        controllerSnapshotSourceId: this.getControllerSnapshotSourceId(),
        availableSources,
        streamRole: this.analysisSource.role as StreamingRole,
        zones: this.camera.zones,
        detectionSettings: this.camera.detectionSettings,
        ptzAutotrack: this.camera.ptzAutotrack,
        frameWorkerSettings: this.resolveFrameWorkerSettings(this.camera.frameWorkerSettings),
        interfaceSettings: this.camera.interfaceSettings,
        nvrRpc: nvrRpcNamespace(),
        streamHot: this.analysisSource.hotMode === true,
        session: instanceId ? { runId: this.workerManager.runId, level: WORKER_PROTOCOL, instanceId } : undefined,
      });

      if (remote) {
        this.placement.started(instanceId);
        return;
      }
      // moved to a worker while the local child initialized, the queued stop ends it
      if (this.placement.phase !== 'local') {
        return;
      }
      this.setStatus(PLUGIN_STATUS.STARTED);
      this.logger.debug('Frame Worker ready');
    } catch (error) {
      if (remote) {
        this.placement.handshakeFailed(error instanceof Error ? error.message : String(error), instanceId);
        return;
      }
      if (this.placement.phase !== 'local') {
        return;
      }
      // a child that started but cannot initialize would pin the status on STARTING
      this.logger.error('Frame Worker initialization failed:', error);
      this.setStatus(PLUGIN_STATUS.ERROR);
      this.supervised?.kill();
    }
    this.settleStart?.();
  }

  private get frameWorkerChildProxy(): Promisify<FrameWorkerChildInterface> {
    return this.proxyServer.proxy.createProxy<FrameWorkerChildInterface>(this.namespaces.frameWorkerChildRpc);
  }

  private pushChildUpdate(label: string, update: Promise<unknown>): void {
    update.catch((error) => this.logger.warn(`Frame worker did not accept the ${label} update:`, error instanceof Error ? error.message : error));
  }

  private resolveFrameWorkerSettings(settings: CameraFrameWorkerSettings): CameraFrameWorkerSettings {
    const resolved: CameraFrameWorkerSettings = { mainStreamAnalysis: settings.mainStreamAnalysis };
    const decoder = this.effectiveDecoder(settings);
    if (decoder) {
      resolved.decoder = decoder;
    }
    return resolved;
  }

  private effectiveDecoder(settings: CameraFrameWorkerSettings): FrameWorkerDecoderSettings | undefined {
    return this.isRemoteWorker ? (settings.workerDecoder ?? settings.decoder) : settings.decoder;
  }

  private attemptRestart(): void {
    if (this.stopping || this.isRestarting || this.isClosed || isShuttingDown() || this.placement.phase !== 'local' || this.status === PLUGIN_STATUS.STARTING) {
      return;
    }

    this.logger.debug('Attempting restart in 5s...');
    clearTimeout(this.retryTimeout);

    this.retryTimeout = setTimeout(async () => {
      if (this.stopping || this.isRestarting || this.isClosed || isShuttingDown() || this.placement.phase !== 'local' || this.status === PLUGIN_STATUS.STARTING) {
        return;
      }

      try {
        this.logger.debug('Executing scheduled restart');
        await this.restart();
      } catch (error) {
        this.logger.error('Failed to restart worker:', error);
      }
    }, 5000);
  }

  private clearProcessState(): void {
    this.process?.removeAllListeners();
    this.process?.stdout?.removeAllListeners();
    this.process?.stderr?.removeAllListeners();
    this.process = undefined;
    this.supervised = undefined;
    this.localBound = undefined;
  }

  private setStatus(newStatus: PLUGIN_STATUS, placement?: PlacementInfo): void {
    if (this.status === newStatus && !placement) {
      return;
    }

    const changed = this.status !== newStatus;
    this._status = newStatus;

    const runtime: WorkerRuntime = {
      [this.camera.name]: {
        name: this.camera.name,
        status: newStatus,
        placement: placement ?? this.placement.info,
      },
    };

    if (changed) {
      this.camera.updateFrameWorkerState(newStatus === PLUGIN_STATUS.STARTED);
      if (newStatus === PLUGIN_STATUS.STARTED) {
        this.catchUpChild();
      } else if (newStatus !== PLUGIN_STATUS.STARTING) {
        this.deferredChanges.clear();
        this.nvrRpcStale = false;
      }
    }
    this.socketService.io.of('/status').emit('frameworker-process-status', runtime);
  }

  private pushNvrRpc(): void {
    this.nvrRpcStale = false;
    this.pushChildUpdate('NVR namespace', this.frameWorkerChildProxy.updateNvrRpc(nvrRpcNamespace()));
  }

  private handleLogData(data: Buffer): void {
    const rawData = data.toString();
    this.logBuffer += rawData;

    const lines = this.logBuffer.split('\n');
    this.logBuffer = lines.pop() ?? '';

    for (const line of lines) {
      this.processLogLine(line);
    }
  }

  private processLogLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed || trimmed.includes('returning true from eof_received')) {
      return;
    }

    const entry = Logger.parseChildLog(trimmed);

    if (entry) {
      this.logManager.handleChildLog(entry);
    } else {
      const rawEntry: LogEntry = {
        timestamp: Date.now(),
        level: 'raw',
        prefix: '',
        message: trimmed,
        targetId: this.camera.id,
        targetType: 'camera',
        source: 'child',
        processId: this.process?.pid,
      };

      this.logManager.handleChildLog(rawEntry);
    }
  }

  private buildWorkerEnv(): Record<string, any> {
    return {
      CAMERA_ID: this.camera.id,
      CAMERA_NAME: this.camera.name,
      PROXY_USER: this.proxyServer.auth.server.user,
      PROXY_PASSWORD: this.proxyServer.auth.server.password,
      PROXY_ENDPOINTS: this.proxyServer.server.endpoints.join(','),
      PROXY_CERT: this.configService.ssl.cert.toString('utf-8'),
      PROXY_KEY: this.configService.ssl.key.toString('utf-8'),
      PROXY_CA: this.configService.ssl.ca.toString('utf-8'),
      LOGGER_LEVEL: this.configService.config.logger.level,
    };
  }

  private rewriteForRemote(url: string): string {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const masterAddress = this.configService.config.workers?.address || '127.0.0.1';
    let rewritten = url.replace(/127\.0\.0\.1|localhost/g, masterAddress);

    const rtsp = this.configService.go2rtcConfig.rtsp;
    if (rtsp.username && rewritten.startsWith('rtsp://')) {
      rewritten = rewritten.replace('rtsp://', `rtsp://${rtsp.username}:${rtsp.password ?? ''}@`);
    }

    return rewritten;
  }

  private get analysisSource() {
    return this.camera.lowResolutionSource ?? this.camera.midResolutionSource ?? this.camera.streamSource;
  }

  private getVideoSource(): string {
    return this.analysisSource.generateRTSPUrl({
      video: true,
      audio: false,
      gop: false,
      backchannel: false,
      timeout: 10,
    });
  }

  private getAvailableSources(): CoordinatorSourceUrl[] {
    const roleSources = [this.camera.highResolutionSource, this.camera.midResolutionSource, this.camera.lowResolutionSource];
    const result: CoordinatorSourceUrl[] = [];

    for (const source of roleSources) {
      if (!source) continue;
      result.push({
        role: source.role as StreamingRole,
        url: source.generateRTSPUrl({
          video: true,
          audio: false,
          gop: true,
          backchannel: false,
          timeout: 10,
        }),
      });
    }

    return result;
  }

  private getAudioSource(): string {
    const lowRes = this.camera.lowResolutionSource;
    const midRes = this.camera.midResolutionSource;
    const streamSource = this.camera.streamSource;
    const source = lowRes ?? midRes ?? streamSource;

    return source.generateRTSPUrl({
      video: false,
      audio: true,
      gop: false,
      backchannel: false,
      timeout: 10,
    });
  }

  private getControllerSnapshotSourceId(): string | undefined {
    if (!this.camera.pluginInfo) return undefined;
    return this.camera.snapshotSource?._id;
  }

  private getSnapshotSource(): string {
    const snapshotSource = this.camera.designatedSnapshotSource;
    const lowRes = this.camera.lowResolutionSource;
    const midRes = this.camera.midResolutionSource;
    const streamSource = this.camera.streamSource;
    const source = lowRes ?? midRes ?? streamSource;

    if (snapshotSource) {
      return snapshotSource.generateSnapshotUrl({
        gop: false,
      });
    }

    return source.generateRTSPUrl({
      video: true,
      audio: false,
      gop: false,
      backchannel: false,
      timeout: 10,
    });
  }
}
