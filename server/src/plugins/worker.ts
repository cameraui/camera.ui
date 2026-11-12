import { sleep } from '@camera.ui/common/utils';
import { Severity } from '@camera.ui/sdk';

import { CamerasService } from '../api/services/cameras.service.js';
import { inject, tryInject } from '../container.js';
import { t } from '../i18n/index.js';
import { emitInternalEvent } from '../internal-bus.js';
import { SystemNotificationTypeId } from '../manager/types.js';
import { PLUGIN_COMMAND, PLUGIN_STATUS } from '../plugins/types.js';
import { NamespaceManager } from '../rpc/namespaces.js';
import { isShuttingDown } from '../shutdown-state.js';
import { describeHost, describePlatformRequirement } from '../utils/platform.js';
import { LocalStartAbandoned, RemotePlacement } from '../workers/lifecycle/remote-placement.js';
import { STORE_LINGER_MS } from '../workers/lifecycle/timing.js';
import { WORKER_PROTOCOL, WorkerCapability } from '../workers/types.js';
import { PluginConfigStore } from './config-store.js';
import { RuntimeFactory } from './runtime/index.js';

import type { PrivateChannel, Promisify } from '@camera.ui/rpc';
import type { BasePlugin, Camera, DeviceStorage, PluginInterfaces } from '@camera.ui/sdk';
import type { CameraUiAPI } from '../api.js';
import type { SocketService } from '../api/websocket/index.js';
import type { WorkerRuntime } from '../api/websocket/types.js';
import type { ProcessMessage, ProcessResponse } from '../plugins/types.js';
import type { ProxyServer } from '../rpc/index.js';
import type { PluginNamespaces } from '../rpc/namespaces.js';
import type { PlacementInfo } from '../workers/lifecycle/remote-placement.js';
import type { Plugin } from './plugin.js';
import type { BasePluginRuntime } from './runtime/base.js';

const LOCAL_READY_TIMEOUT_MS = 2 * 60_000;
const CRASH_RESTART_MS = 5000;

export class PluginWorker {
  private api: CameraUiAPI;
  private socketService: SocketService;
  private proxyServer: ProxyServer;
  private camerasService: CamerasService;
  private runtime: BasePluginRuntime;
  private placement: RemotePlacement;

  private stopping = false;
  private localReadyTimeout?: NodeJS.Timeout;
  private localBound?: string;
  private settleLocal?: { resolve: () => void; reject: (error: Error) => void };
  private configStore?: PluginConfigStore;
  private storeLinger?: NodeJS.Timeout;
  private announcedInstance?: string;
  private opChain: Promise<unknown> = Promise.resolve();

  private channel?: PrivateChannel;
  private channelOpening?: Promise<void>;
  private ended = false;
  private namespaces: PluginNamespaces;

  private _status: PLUGIN_STATUS = PLUGIN_STATUS.UNKNOWN;

  constructor(public plugin: Plugin) {
    this.api = inject('api');
    this.socketService = inject('socketService');
    this.proxyServer = inject('proxy');
    this.camerasService = new CamerasService();

    this.namespaces = NamespaceManager.pluginNamespaces(this.plugin.id);
    this.runtime = RuntimeFactory.createRuntime(this.plugin);

    this.placement = new RemotePlacement(
      WorkerCapability.PluginHost,
      this.plugin.pluginName,
      `plugin ${this.plugin.pluginName}`,
      {
        runLocal: (reason) => this.runLocal(reason),
        stopLocal: (reason) => {
          // the waiting local start holds the lock, reject it first or this deadlocks
          this.settleLocal?.reject(new LocalStartAbandoned(reason));
          this.settleLocal = undefined;
          return this.runExclusive(() => this.stopLocal(reason));
        },
        handshake: (instanceId) => this.sendStart(instanceId),
        resume: (instanceId) => this.sendResume(instanceId),
        lost: (reason) => this.onRemoteLost(reason),
        changed: (info) => this.onPlacementChanged(info),
      },
      this.runtime.logger,
      () => tryInject('workerManager'),
    );

    if (this.plugin.disabled) {
      this._status = PLUGIN_STATUS.DISABLED;
    }
  }

  public get status(): PLUGIN_STATUS {
    return this._status;
  }

  public get pluginProxy(): Promisify<BasePlugin & PluginInterfaces> {
    return this.proxyServer.proxy.createProxy<BasePlugin & PluginInterfaces>(this.namespaces.pluginChildRpc);
  }

  public get storageProxy(): Promisify<DeviceStorage> {
    return this.proxyServer.proxy.createProxy<DeviceStorage>(this.namespaces.pluginStorageRpc);
  }

  public get isRemoteWorker(): boolean {
    const host = this.placement.host;
    return host !== undefined && host !== 'master';
  }

  public get workerAgentId(): string | undefined {
    const host = this.placement.host;
    return host === 'master' ? undefined : host;
  }

  public get isLocal(): boolean {
    return this.placement.phase === 'local';
  }

  public get placementInfo(): PlacementInfo {
    return this.placement.info;
  }

  public start(): Promise<void> {
    return this.runExclusive(() => this.doStart());
  }

  public teardown(destroy?: boolean): Promise<void> {
    return this.runExclusive(() => this.doTeardown(destroy));
  }

  public restart(): Promise<void> {
    return this.runExclusive(() => this.doRestart());
  }

  public disable(): void {
    this.teardown().catch(() => {});
  }

  public getPID(): number {
    return this.runtime.getPID();
  }

  public isRunning(): boolean {
    if (this.placement.remote) {
      return this._status === PLUGIN_STATUS.STARTED;
    }
    return this.runtime.isRunning() && this._status === PLUGIN_STATUS.STARTED;
  }

  public isReady(): boolean {
    return this.status === PLUGIN_STATUS.READY || this.status === PLUGIN_STATUS.STARTED;
  }

  public async cleanup(): Promise<void> {
    this.runtime.cleanup();
    await this.teardown(true);
  }

  private runExclusive<T>(op: () => Promise<T>): Promise<T> {
    const run = this.opChain.then(op, op);
    this.opChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private get busy(): boolean {
    const phase = this.placement.phase;
    if (phase === 'local') {
      return this.runtime.isRunning();
    }
    return phase !== 'idle' && phase !== 'releasing' && phase !== 'failed';
  }

  private async doStart(): Promise<void> {
    if (this.busy) {
      this.runtime.logger.warn(
        `Cannot start plugin! Plugin ${this.plugin.displayName} (${this.plugin.pluginName}.${this.plugin.info.installedVersion}) already running!`,
      );
      return;
    }

    if (this.plugin.disabled) {
      this.setStatus(PLUGIN_STATUS.DISABLED);
      this.runtime.logger.warn(`Can not start plugin. Plugin ${this.plugin.displayName} is disabled!`);
      return;
    }

    this.setStatus(PLUGIN_STATUS.STARTING);
    this.stopping = false;

    try {
      // channel first, a remote child sends READY over it
      await this.ensureChannel();
      if (this.placement.place('start') === 'local') {
        await this.startLocal();
      }
    } catch (error) {
      if (error instanceof LocalStartAbandoned) {
        return;
      }
      // an early exit already set STOPPED and scheduled the crash restart
      if (this._status === PLUGIN_STATUS.STARTING || this._status === PLUGIN_STATUS.READY) {
        this.setStatus(PLUGIN_STATUS.ERROR);
      }
      await this.stopLocal().catch(() => {});
      throw error;
    }
  }

  private runLocal(reason: string): void {
    this.runtime.logger.log(`Running plugin ${this.plugin.displayName} on this server: ${reason}`);
    this.runExclusive(async () => {
      if (this.placement.phase === 'local' && !this.runtime.isRunning()) {
        this.setStatus(PLUGIN_STATUS.STARTING);
        await this.startLocal();
      }
    }).catch((error) => {
      if (!(error instanceof LocalStartAbandoned)) {
        this.runtime.logger.error(`Failed to start plugin ${this.plugin.displayName} here:`, error);
      }
    });
  }

  private async startLocal(): Promise<void> {
    // local plugins own their store file themselves
    await this.closeConfigStore();

    if (!this.plugin.info.compatible) {
      this.setStatus(PLUGIN_STATUS.INCOMPATIBLE);
      const requirement = describePlatformRequirement(this.plugin.info);
      this.runtime.logger.warn(
        `Can not start plugin ${this.plugin.displayName} on this system (${describeHost()}), it requires ${requirement}. Assign a compatible worker.`,
      );
      return;
    }

    if (this.gateProtocol()) {
      return;
    }

    this.stopping = false;
    this.localBound = undefined;
    const started = new Promise<void>((resolve, reject) => {
      this.settleLocal = { resolve, reject };
    });

    this.runtime.once('exit', () => this.onLocalExit());
    await this.runtime.start();
    this.armLocalReadyTimeout();
    await started;
  }

  private async stopLocal(reason?: string): Promise<void> {
    clearTimeout(this.localReadyTimeout);
    this.localReadyTimeout = undefined;
    if (!this.runtime.isRunning()) {
      return;
    }

    this.stopping = true;
    this.runtime.logger.log(`Stopping plugin: ${this.plugin.pluginName}.${this.plugin.displayName}${reason ? ` (${reason})` : ''}...`);
    await this.kill();
  }

  private onLocalExit(): void {
    clearTimeout(this.localReadyTimeout);
    this.localReadyTimeout = undefined;
    this.localBound = undefined;
    this.settleLocal?.reject(new Error(`Plugin ${this.plugin.displayName} exited before it was ready`));
    this.settleLocal = undefined;

    // moved to a worker meanwhile, the placement owns the status
    if (this.placement.phase !== 'local') {
      return;
    }

    this.setStatus(this.plugin.disabled ? PLUGIN_STATUS.DISABLED : PLUGIN_STATUS.STOPPED);
    if (this.stopping || isShuttingDown()) {
      return;
    }

    this.emitCrashed();
    this.runtime.logger.log(`Restarting plugin: ${this.plugin.pluginName}.${this.plugin.displayName} in 5s...`);
    setTimeout(() => {
      if (!this.stopping && !isShuttingDown() && this.placement.phase === 'local') {
        this.start().catch(() => {});
      }
    }, CRASH_RESTART_MS);
  }

  private armLocalReadyTimeout(): void {
    clearTimeout(this.localReadyTimeout);
    this.localReadyTimeout = setTimeout(() => {
      if (this.placement.phase !== 'local' || this.status !== PLUGIN_STATUS.STARTING || this.stopping) {
        return;
      }
      this.runtime.logger.error(`Plugin ${this.plugin.displayName} did not become ready within ${LOCAL_READY_TIMEOUT_MS / 1000}s, killing the process. `);
      this.setStatus(PLUGIN_STATUS.ERROR);
      this.settleLocal?.reject(new Error(`Plugin ${this.plugin.displayName} did not become ready in time`));
      this.settleLocal = undefined;
      this.runExclusive(() => this.stopLocal()).catch(() => {});
    }, LOCAL_READY_TIMEOUT_MS);
  }

  private async ensureChannel(): Promise<void> {
    if (this.ended || (this.channel && !this.channel.isClosed)) {
      return;
    }
    this.channelOpening ??= (async () => {
      const channel = await this.proxyServer.proxy.privateChannel('plugin-communication', this.namespaces.pluginChild);
      channel.on('message', (message: ProcessResponse) => this.onMessage(message));
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
    this.ensureChannel().catch((error) => this.runtime.logger.warn(`Could not reopen the channel of plugin ${this.plugin.displayName}:`, error));
  }

  private async ensureConfigStore(): Promise<void> {
    clearTimeout(this.storeLinger);
    this.storeLinger = undefined;
    if (this.configStore) {
      return;
    }
    this.configStore = new PluginConfigStore(this.plugin.id, this.plugin.storagePath, (instanceId) => this.placement.owns(instanceId));
    await this.configStore.register(this.proxyServer.proxy);
  }

  private async closeConfigStore(): Promise<void> {
    clearTimeout(this.storeLinger);
    this.storeLinger = undefined;
    const store = this.configStore;
    this.configStore = undefined;
    await store?.close();
  }

  private gateProtocol(): boolean {
    const compat = this.plugin.info.protocolCompat;
    if (compat !== 'pluginTooOld' && compat !== 'serverTooOld') {
      return false;
    }

    const status = compat === 'pluginTooOld' ? PLUGIN_STATUS.UPDATE_REQUIRED : PLUGIN_STATUS.SERVER_UPDATE_REQUIRED;
    const alreadyFlagged = this.status === status;
    this.setStatus(status);
    this.runtime.logger.warn(
      compat === 'pluginTooOld'
        ? `Can not start plugin ${this.plugin.displayName}: it was built for an older camera.ui plugin API. Update the plugin.`
        : `Can not start plugin ${this.plugin.displayName}: it was built for a newer camera.ui plugin API. Update camera.ui.`,
    );

    if (!alreadyFlagged) {
      this.proxyServer.notificationManager
        .notify({
          source: { kind: 'system', id: SystemNotificationTypeId.PluginIncompatible },
          notification: {
            title: t('plugins.not_started_title'),
            body: t(compat === 'pluginTooOld' ? 'plugins.needs_plugin_update' : 'plugins.needs_server_update', { plugin: this.plugin.displayName }),
            severity: Severity.Warn,
            tag: `${SystemNotificationTypeId.PluginIncompatible}:${this.plugin.id}`,
            deepLink: `/plugins/${this.plugin.pluginName}`,
          },
        })
        .catch(() => {});
    }

    return true;
  }

  private async doTeardown(destroy?: boolean): Promise<void> {
    // on master shutdown the remote instance keeps running, the next run takes it over
    if (isShuttingDown() && this.placement.remote) {
      this.placement.detach();
      return;
    }

    if (this.isRunning()) {
      this.runtime.logger.log(`Stopping plugin: ${this.plugin.pluginName}.${this.plugin.displayName}...`);
    }

    this.stopping = true;
    clearTimeout(this.localReadyTimeout);
    this.localReadyTimeout = undefined;
    this.disconnectCameras();

    const agentId = this.placement.agentId;
    switch (this.placement.stop()) {
      case 'local':
        await this.kill();
        this.setStatus(this.plugin.disabled ? PLUGIN_STATUS.DISABLED : PLUGIN_STATUS.STOPPED);
        break;
      case 'stopped':
        this.setStatus(this.plugin.disabled ? PLUGIN_STATUS.DISABLED : PLUGIN_STATUS.STOPPED);
        break;
      case 'releasing':
        // on windows, go plugins before the stop line only stop on a channel STOP
        if (
          this.plugin.isGo &&
          agentId &&
          tryInject('workerManager')
            ?.getWorkers()
            .find((worker) => worker.agentId === agentId)?.platform?.os === 'win32'
        ) {
          await this.sendMessage({ type: PLUGIN_COMMAND.STOP }).catch(() => {});
        }
        break;
    }

    if (destroy) {
      this.ended = true;
      this.placement.close();
      await this.channel?.close();
      this.channel = undefined;
      await this.closeConfigStore();
    }
  }

  private async doRestart(): Promise<void> {
    // restart on the same worker, the placement drives the status
    const host = this.placement.host;
    if (host && host !== 'master' && this.placement.phase !== 'failed') {
      this.placement.restart('restart requested');
      return;
    }

    await this.doTeardown();
    await sleep(1000);
    await this.doStart();
  }

  private async sendMessage(message: ProcessMessage): Promise<void> {
    if (!this.channel || this.channel.isClosed) {
      return;
    }

    await this.channel.send<ProcessMessage>(message);
  }

  private sendStart(instanceId: string | undefined): void {
    this.setStatus(PLUGIN_STATUS.READY);
    const runId = tryInject('workerManager')?.runId;

    this.sendMessage({
      type: PLUGIN_COMMAND.START,
      data: {
        cameras: this.gatherDevices(),
        plugin: {
          id: this.plugin.id,
          name: this.plugin.pluginName,
          contract: this.plugin.contract,
        },
        storage: {
          installPath: this.plugin.installPath,
          storagePath: this.plugin.storagePath,
        },
        session: runId ? { runId, level: WORKER_PROTOCOL, instanceId } : undefined,
      },
    }).catch((error) => this.runtime.logger.warn(`Could not send START to plugin ${this.plugin.displayName}:`, error));
  }

  private sendResume(instanceId: string): void {
    const runId = tryInject('workerManager')?.runId;
    if (!runId) {
      return;
    }
    this.sendMessage({ type: PLUGIN_COMMAND.RESUME, data: { runId, instanceId } }).catch((error) =>
      this.runtime.logger.debug(`Could not send resume to plugin ${this.plugin.displayName}:`, error),
    );
  }

  private gatherDevices(): Camera[] {
    const pluginCameras = this.camerasService.listTransformedByPluginId(this.plugin.id);
    const extensionCameras = this.camerasService.listTransformedByContract(this.plugin.pluginName, this.plugin.contract);
    const selectedCameras = this.camerasService.listTransformedByPlugin(this.plugin.pluginName);

    const cameraMap = new Map<string, Camera>();
    [...pluginCameras, ...extensionCameras, ...selectedCameras].forEach((camera) => {
      cameraMap.set(camera._id, camera);
    });

    return Array.from(cameraMap.values());
  }

  private disconnectCameras(): void {
    if (isShuttingDown()) return;
    this.api.getCameras(this.plugin.id).forEach((cameraController) => cameraController.disconnect());
  }

  private async kill(): Promise<void> {
    // go plugins before the stop line read no stdin, windows has no SIGTERM
    if (this.plugin.isGo && process.platform === 'win32') {
      await this.sendMessage({ type: PLUGIN_COMMAND.STOP }).catch(() => {});
    }

    this.disconnectCameras();

    await this.runtime.stop();
  }

  private onRemoteLost(reason: string): void {
    tryInject('sensorRegistry')?.removePluginSensors(this.plugin.id);
    this.disconnectCameras();
    this.runtime.logger.debug(`Plugin ${this.plugin.displayName} lost its instance: ${reason}`);
    this.emitCrashed();
  }

  private onPlacementChanged(info: PlacementInfo): void {
    if (info.host !== 'master' && info.phase !== 'idle') {
      this.ensureConfigStore().catch((error) => this.runtime.logger.error(`Could not open the config store of plugin ${this.plugin.displayName}:`, error));
    }

    switch (info.phase) {
      case 'local':
        break;
      case 'pending':
      case 'provisioning':
      case 'spawned':
      case 'adopting':
      case 'restarting':
      case 'held':
      case 'waiting-for-worker':
        this.setStatus(PLUGIN_STATUS.STARTING, info);
        break;
      case 'handshaking':
        this.setStatus(PLUGIN_STATUS.READY, info);
        break;
      case 'bound':
        if (info.instanceId !== this.announcedInstance) {
          this.announcedInstance = info.instanceId;
          const version = this.placement.boundVersion ?? this.plugin.info.installedVersion;
          this.runtime.logger.log(`Plugin started: ${this.plugin.displayName} (${this.plugin.pluginName}@${version}) on worker ${info.worker}`);
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
        // keep the store a moment for puts still in flight
        this.setStatus(this.plugin.disabled ? PLUGIN_STATUS.DISABLED : PLUGIN_STATUS.STOPPED, info);
        clearTimeout(this.storeLinger);
        this.storeLinger = setTimeout(() => {
          if (this.placement.phase === 'idle') this.closeConfigStore();
        }, STORE_LINGER_MS);
        break;
    }
  }

  private emitCrashed(): void {
    emitInternalEvent('plugin:crashed', {
      pluginName: this.plugin.pluginName,
      pluginId: this.plugin.id,
      displayName: this.plugin.displayName,
      status: this._status,
    });
  }

  private setStatus(status: PLUGIN_STATUS, placement?: PlacementInfo): void {
    if (this._status === status) {
      if (placement) this.emitStatus(status, placement);
      return;
    }

    this._status = status;

    if (status === PLUGIN_STATUS.STARTED) {
      this.plugin.runningVersion = this.plugin.info.installedVersion;
    } else if (status === PLUGIN_STATUS.STOPPED || status === PLUGIN_STATUS.DISABLED || status === PLUGIN_STATUS.ERROR) {
      this.plugin.runningVersion = undefined;
    }

    this.emitStatus(status, placement ?? this.placement.info);
    this.proxyServer.coreManager?.publishCoreManagerEvent('pluginStatusChanged', { pluginName: this.plugin.pluginName, running: this.isRunning() });

    const eventMap: Partial<Record<PLUGIN_STATUS, 'plugin:started' | 'plugin:stopped' | 'plugin:error'>> = {
      [PLUGIN_STATUS.STARTED]: 'plugin:started',
      [PLUGIN_STATUS.STOPPED]: 'plugin:stopped',
      [PLUGIN_STATUS.ERROR]: 'plugin:error',
    };
    const busEvent = eventMap[status];
    if (busEvent) {
      emitInternalEvent(busEvent, { pluginName: this.plugin.pluginName, pluginId: this.plugin.id, status });
    }
  }

  private emitStatus(status: PLUGIN_STATUS, placement: PlacementInfo): void {
    const runtimeInfo: WorkerRuntime = {
      [this.plugin.pluginName]: { name: this.plugin.pluginName, status, placement },
    };
    this.socketService.io.of('/status').emit('plugin-process-status', runtimeInfo);
    this.socketService.io.of('/plugins').emit(`plugin-status-${this.plugin.pluginName}`, runtimeInfo[this.plugin.pluginName]);
  }

  private onMessage(message: ProcessResponse): void {
    switch (message.type) {
      case PLUGIN_STATUS.READY:
        this.runtime.logger.debug(`Plugin ready: ${this.plugin.displayName} (${this.plugin.pluginName}@${this.plugin.info.installedVersion})`);
        if (!this.placement.ready(message.instanceId, message.handshake)) {
          this.onLocalReady(message.instanceId);
        }
        break;
      case PLUGIN_STATUS.STARTED:
        if (this.placement.phase !== 'local') {
          const runId = tryInject('workerManager')?.runId;
          this.placement.started(message.instanceId, { resumed: message.resumed, current: message.runId && runId ? message.runId === runId : undefined });
          break;
        }
        if (message.instanceId && message.instanceId !== this.localBound) {
          this.runtime.logger.debug(`Ignored STARTED of instance ${message.instanceId}`);
          break;
        }
        this.runtime.logger.log(`Plugin started: ${this.plugin.displayName} (${this.plugin.pluginName}@${this.plugin.info.installedVersion})`);
        this.setStatus(PLUGIN_STATUS.STARTED);
        this.settleLocal?.resolve();
        this.settleLocal = undefined;
        break;
      case PLUGIN_STATUS.ERROR:
        if (this.placement.phase !== 'local') {
          this.placement.handshakeFailed(
            message.code === 'resume-mismatch' ? `could not reattach: ${message.error}` : (message.error ?? 'the plugin failed to start'),
            message.instanceId,
          );
          break;
        }
        if (message.instanceId && message.instanceId !== this.localBound) {
          break;
        }
        this.setStatus(PLUGIN_STATUS.ERROR);
        this.settleLocal?.reject(new Error(message.error ?? 'the plugin failed to start'));
        this.settleLocal = undefined;
        this.runExclusive(() => this.stopLocal()).catch(() => {});
        break;
      default:
        this.runtime.logger.warn(`Unknown message type: ${message.type}`);
    }
  }

  private onLocalReady(instanceId?: string): void {
    const own = this.runtime.instanceId;
    const matches = instanceId ? instanceId === own : this.runtime.isRunning() && !this.localBound;
    if (!matches || this.localBound) {
      this.runtime.logger.debug(`Ignored READY of instance ${instanceId ?? '(none)'}`);
      return;
    }

    clearTimeout(this.localReadyTimeout);
    this.localReadyTimeout = undefined;
    this.localBound = own;
    this.sendStart(own);
  }
}
