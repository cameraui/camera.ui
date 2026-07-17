import { sleep } from '@camera.ui/common/utils';
import { join } from 'node:path';
import { container } from 'tsyringe';

import { CamerasService } from '../api/services/cameras.service.js';
import { PLUGIN_COMMAND, PLUGIN_STATUS } from '../plugins/types.js';
import { NamespaceManager } from '../rpc/namespaces.js';
import { isShuttingDown } from '../shutdown-state.js';
import { describePlatformRequirement } from '../utils/platform.js';
import { PluginConfigStore } from './config-store.js';
import { RuntimeFactory } from './runtime/index.js';
import { migrateLmdbToStoreFile } from './store/migrate.js';
import { STORE_FILE_NAME } from './store/pluginStoreFile.js';

import type { PrivateChannel, Promisify } from '@camera.ui/rpc';
import type { BasePlugin, Camera, DeviceStorage, PluginInterfaces } from '@camera.ui/sdk';
import type { CameraUiAPI } from '../api.js';
import type { SocketService } from '../api/websocket/index.js';
import type { WorkerRuntime } from '../api/websocket/types.js';
import type { InternalEventBus } from '../internal-bus.js';
import type { ProcessMessage, ProcessResponse } from '../plugins/types.js';
import type { ProxyServer } from '../rpc/index.js';
import type { PluginNamespaces } from '../rpc/namespaces.js';
import type { WorkerManager } from '../workers/manager.js';
import type { Plugin } from './plugin.js';
import type { BasePluginRuntime } from './runtime/base.js';

const REMOTE_START_TIMEOUT_MS = 5 * 60_000;
const REMOTE_START_MAX_MS = 10 * 60_000;

export class PluginWorker {
  private api: CameraUiAPI;
  private socketService: SocketService;
  private proxyServer: ProxyServer;
  private camerasService: CamerasService;
  private runtime: BasePluginRuntime;

  private started = false;
  private shuttingDown = false;
  private isRemote = false;
  private remoteStartTimeout?: NodeJS.Timeout;
  private configStore?: PluginConfigStore;
  private opChain: Promise<unknown> = Promise.resolve();

  private channel?: PrivateChannel;
  private namespaces: PluginNamespaces;

  private _status: PLUGIN_STATUS = PLUGIN_STATUS.UNKNOWN;

  constructor(public plugin: Plugin) {
    this.api = container.resolve<CameraUiAPI>('api');
    this.socketService = container.resolve<SocketService>('socketService');
    this.proxyServer = container.resolve<ProxyServer>('proxy');
    this.camerasService = new CamerasService();

    this.namespaces = NamespaceManager.pluginNamespaces(this.plugin.id);
    this.runtime = RuntimeFactory.createRuntime(this.plugin);

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
    this.teardown();
    this.setStatus(PLUGIN_STATUS.DISABLED);
  }

  public getPID(): number {
    return this.runtime.getPID();
  }

  public isRunning(): boolean {
    if (this.isRemote) {
      return this.started;
    }
    return this.runtime.isRunning() && this.started;
  }

  public get isRemoteWorker(): boolean {
    return this.isRemote;
  }

  public isReady(): boolean {
    return this.status === PLUGIN_STATUS.READY || this.status === PLUGIN_STATUS.STARTED;
  }

  public async cleanup(): Promise<void> {
    this.runtime.cleanup();
    await this.teardown();
  }

  private runExclusive<T>(op: () => Promise<T>): Promise<T> {
    const run = this.opChain.then(op, op);
    this.opChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async doStart(): Promise<void> {
    if (this.isRunning()) {
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
    this.shuttingDown = false;

    return new Promise<void>(async (resolve, reject) => {
      try {
        await this.reset();
        // Channel first — the (possibly remote) child sends READY over it.
        await this.openChannel(resolve, reject);

        const agentId = this.workerManagerRef()?.desirePluginHost(this.plugin.pluginName);
        if (agentId) {
          this.isRemote = true;
          await this.ensureConfigStore();
          this.runtime.logger.log(`Delegating plugin ${this.plugin.displayName} to remote worker ${agentId}`);
          this.armRemoteFallback(resolve, reject);
          return;
        }

        this.isRemote = false;

        if (!this.plugin.info.compatible) {
          this.setStatus(PLUGIN_STATUS.INCOMPATIBLE);
          const requirement = describePlatformRequirement(this.plugin.info.os, this.plugin.info.cpu);
          const host = `${process.platform}/${process.arch}`;
          this.runtime.logger.warn(`Can not start plugin ${this.plugin.displayName} on this system (${host}) — requires ${requirement}. Assign a compatible worker.`);
          await this.channel?.close();
          resolve();
          return;
        }

        if (this.plugin.isGo) {
          const volumeDir = join(this.plugin.storagePath, 'volume');
          await migrateLmdbToStoreFile(volumeDir, join(volumeDir, STORE_FILE_NAME));
        }

        this.runtime.once('exit', () => {
          reject(new Error(`Plugin ${this.plugin.displayName} exited before it was ready`));
          this.handleClose();
        });
        await this.runtime.start();
      } catch (error) {
        this.setStatus(PLUGIN_STATUS.ERROR);
        await this.doTeardown();
        reject(error);
      }
    });
  }

  private async openChannel(resolve: (value: void | PromiseLike<void>) => void, reject: (reason?: any) => void): Promise<void> {
    await this.channel?.close();
    this.channel = await this.proxyServer.proxy.privateChannel('plugin-communication', this.namespaces.pluginChild);
    this.channel.on('message', this.onMessage.bind(this, resolve, reject));
  }

  private async ensureConfigStore(): Promise<void> {
    if (this.configStore) {
      return;
    }
    this.configStore = new PluginConfigStore(this.plugin.id, this.plugin.storagePath);
    await this.configStore.register(this.proxyServer.proxy);
  }

  private workerManagerRef(): WorkerManager | undefined {
    return container.isRegistered('workerManager') ? container.resolve<WorkerManager>('workerManager') : undefined;
  }

  private armRemoteFallback(resolve: (value: void | PromiseLike<void>) => void, reject: (reason?: any) => void, began = Date.now()): void {
    clearTimeout(this.remoteStartTimeout);

    this.remoteStartTimeout = setTimeout(async () => {
      if (!this.isRemote || this.status !== PLUGIN_STATUS.STARTING || this.shuttingDown) {
        return;
      }

      const state = this.workerManagerRef()?.getRemotePluginState(this.plugin.pluginName);
      const elapsed = Date.now() - began;
      if (state === 'installing' && elapsed < REMOTE_START_MAX_MS) {
        this.runtime.logger.log(`Remote worker is still provisioning ${this.plugin.displayName} (${Math.round(elapsed / 60_000)}min) — waiting`);
        this.armRemoteFallback(resolve, reject, began);
        return;
      }

      this.runtime.logger.warn(`Remote worker did not start plugin ${this.plugin.displayName} within ${Math.round(elapsed / 60_000)}min — re-placing locally`);
      this.workerManagerRef()?.clearPluginHost(this.plugin.pluginName);
      this.isRemote = false;

      try {
        // Fresh channel so a late READY from the (now abandoned) remote child
        // lands on the old, closed channel and can never trigger a second START.
        await this.openChannel(resolve, reject);

        // Local plugins own their store file themselves — release the store
        // opened for the remote attempt so the child can take ownership.
        await this.configStore?.close();
        this.configStore = undefined;

        if (!this.plugin.info.compatible) {
          this.setStatus(PLUGIN_STATUS.INCOMPATIBLE);
          await this.channel?.close();
          resolve();
          return;
        }

        this.runtime.once('exit', () => {
          reject(new Error(`Plugin ${this.plugin.displayName} exited before it was ready`));
          this.handleClose();
        });
        await this.runtime.start();
      } catch (error) {
        this.setStatus(PLUGIN_STATUS.ERROR);
        reject(error);
      }
    }, REMOTE_START_TIMEOUT_MS);
  }

  private async doTeardown(destroy?: boolean): Promise<void> {
    if (this.isRunning()) {
      this.runtime.logger.log(`Stopping plugin: ${this.plugin.pluginName}.${this.plugin.displayName}...`);
    }

    this.shuttingDown = true;

    const cameraControllers = this.api.getCameras(this.plugin.id);
    cameraControllers.forEach((cameraController) => cameraController.disconnect());

    // Remote: remove from the desired state — the agent stops the child on
    // the next nudge/heartbeat. No local runtime to kill.
    if (this.isRemote) {
      clearTimeout(this.remoteStartTimeout);
      this.remoteStartTimeout = undefined;
      await this.sendMessage({ type: PLUGIN_COMMAND.STOP }).catch(() => {});
      this.workerManagerRef()?.clearPluginHost(this.plugin.pluginName);
      this.isRemote = false;
      await this.channel?.close();
      await this.configStore?.close();
      this.configStore = undefined;
      this.setStatus(this.plugin.disabled ? PLUGIN_STATUS.DISABLED : PLUGIN_STATUS.STOPPED);
      return;
    }

    if (destroy) {
      this.runtime.kill();
    } else {
      await this.kill();
    }

    await this.configStore?.close();
    this.configStore = undefined;
  }

  private async doRestart(): Promise<void> {
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

  private async kill(): Promise<void> {
    await this.sendMessage({ type: PLUGIN_COMMAND.STOP }).catch(() => {});

    const cameraControllers = this.api.getCameras(this.plugin.id);
    cameraControllers.forEach((cameraController) => cameraController.disconnect());

    await this.runtime.stop();
  }

  private setStatus(status: PLUGIN_STATUS): void {
    if (this._status === status) {
      return;
    }

    this._status = status;
    this.started = status === PLUGIN_STATUS.STARTED;

    if (status === PLUGIN_STATUS.STARTED) {
      this.plugin.runningVersion = this.plugin.info.installedVersion;
    } else if (status === PLUGIN_STATUS.STOPPED || status === PLUGIN_STATUS.DISABLED || status === PLUGIN_STATUS.ERROR) {
      this.plugin.runningVersion = undefined;
    }

    const runtimeInfo: WorkerRuntime = {
      [this.plugin.pluginName]: {
        name: this.plugin.pluginName,
        status: status,
      },
    };

    this.socketService.io.of('/status').emit('plugin-process-status', runtimeInfo);
    this.socketService.io.of('/plugins').emit(`plugin-status-${this.plugin.pluginName}`, runtimeInfo[this.plugin.pluginName]);

    const eventMap: Partial<Record<PLUGIN_STATUS, 'plugin:started' | 'plugin:stopped' | 'plugin:error'>> = {
      [PLUGIN_STATUS.STARTED]: 'plugin:started',
      [PLUGIN_STATUS.STOPPED]: 'plugin:stopped',
      [PLUGIN_STATUS.ERROR]: 'plugin:error',
    };
    const busEvent = eventMap[status];
    if (busEvent) {
      try {
        const bus = container.resolve<InternalEventBus>('internalBus');
        bus.emitEvent(busEvent, { pluginName: this.plugin.pluginName, pluginId: this.plugin.id, status });
      } catch {
        // ignore
      }
    }
  }

  private async handleClose(): Promise<void> {
    await this.channel?.close();

    if (this.plugin.disabled) {
      this.setStatus(PLUGIN_STATUS.DISABLED);
    } else {
      this.setStatus(PLUGIN_STATUS.STOPPED);
    }

    if (!this.shuttingDown && !isShuttingDown()) {
      try {
        const bus = container.resolve<InternalEventBus>('internalBus');
        bus.emitEvent('plugin:crashed', {
          pluginName: this.plugin.pluginName,
          pluginId: this.plugin.id,
          displayName: this.plugin.displayName,
          status: this._status,
        });
      } catch {
        // ignore
      }

      this.runtime.logger.log(`Restarting plugin: ${this.plugin.pluginName}.${this.plugin.displayName} in 5s...`);

      setTimeout(() => {
        if (this.shuttingDown || isShuttingDown()) {
          return;
        }
        this.start().catch(() => {});
      }, 5000);
    }
  }

  private async reset(): Promise<void> {
    await this.channel?.close();
    await sleep(100);
  }

  private async onMessage(resolve: (value: void | PromiseLike<void>) => void, reject: (reason?: any) => void, message: ProcessResponse) {
    switch (message.type) {
      case PLUGIN_STATUS.READY:
        this.runtime.logger.debug(`Plugin ready: ${this.plugin.displayName} (${this.plugin.pluginName}@${this.plugin.info.installedVersion})`);

        // Remote child made it — no local fallback needed.
        clearTimeout(this.remoteStartTimeout);
        this.remoteStartTimeout = undefined;

        this.setStatus(PLUGIN_STATUS.READY);

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
          },
        });
        break;
      case PLUGIN_STATUS.STARTED:
        this.runtime.logger.log(`Plugin started: ${this.plugin.displayName} (${this.plugin.pluginName}@${this.plugin.info.installedVersion})`);
        this.setStatus(PLUGIN_STATUS.STARTED);
        resolve();
        break;
      case PLUGIN_STATUS.ERROR:
        this.setStatus(PLUGIN_STATUS.ERROR);
        this.teardown();
        reject(message.error);
        break;
      default:
        this.runtime.logger.warn(`Unknown message type: ${message.type}`);
        reject(`Unknown message type: ${message.type}`);
    }
  }
}
