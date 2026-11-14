import { Logger } from '@camera.ui/common/logger';
import { SignalHandler, sleep } from '@camera.ui/common/utils';
import { createRPCClient } from '@camera.ui/rpc';
import { API_EVENT } from '@camera.ui/sdk';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isPromise } from 'node:util/types';

import { setupNodeAvLog } from '../../../camera/streaming/node-av-log.js';
import { NamespaceManager } from '../../../rpc/namespaces.js';
import { REPORT_DIR, WITH_REPORTS } from '../../../utils/crash.js';
import { HANDSHAKE_LEVEL, hostSpeaksStopLine, hostStopBudget, INSTANCE_ID_ENV, listenForHostStop } from '../../../utils/host-protocol.js';
import { PluginStoreFile } from '../../store/pluginStoreFile.js';
import { PLUGIN_COMMAND, PLUGIN_STATUS } from '../../types.js';
import { LocalPluginConfigDb, RemotePluginConfigDb } from './configDb.js';
import { forceServerNodeAv } from './node-av-resolve.js';
import { PluginAPI } from './pluginApi.js';
import { CameraDeviceProxy } from './proxy/cameraDevice.js';
import { PluginFileServer } from './proxy/fileServe.js';

import type { LoggerOptions } from '@camera.ui/common';
import type { Channel, RPCClient } from '@camera.ui/rpc';
import type { BasePlugin, Camera, DeviceStorage, PluginInfo } from '@camera.ui/sdk';
import type { PluginConfigStoreRPC } from '../../config-store.js';
import type { ProcessLoadMessage, ProcessMessage, ProcessResponse } from '../../types.js';
import type { PluginConfigDb } from './configDb.js';

type PluginConstructor = new (logger: Logger, api: PluginAPI, storage: DeviceStorage<Record<string, any>>) => BasePlugin;

const SHUTDOWN_LISTENER_TIMEOUT = 1500;
const RPC_TEARDOWN_TIMEOUT = 1000;
const REATTACH_DEADLINE_MS = 240_000;
const REATTACH_RETRY_DELAYS_MS = [1000, 2000, 5000, 10_000];

type Phase = 'ready-sent' | 'starting' | 'started' | 'reattach-wait' | 'reattaching' | 'start-error';

const processName = process.argv[3] || process.argv[2] || 'Plugin';
process.title = `camera.ui - ${processName}`;

export class PluginChild {
  private proxy: RPCClient;
  private channel?: Channel;

  private displayName: string;
  private endpoints: string[];
  private api?: PluginAPI;
  private plugin?: BasePlugin;
  private closeProxy?: () => Promise<void>;
  private pluginDb?: PluginConfigDb;
  private fileServer?: PluginFileServer;
  private signalHandler: SignalHandler;

  private logger: Logger;
  private loggerOptions: LoggerOptions;

  private stopped = false;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  private readonly instanceId = process.env[INSTANCE_ID_ENV] || undefined;
  private phase: Phase = 'ready-sent';
  private attachedRun?: string;
  private pendingResume?: string;
  private level2Master = false;
  private startError?: string;

  constructor() {
    this.endpoints = process.env.PROXY_ENDPOINTS!.split(',');

    this.proxy = createRPCClient({
      name: NamespaceManager.pluginNamespaces(process.env.PLUGIN_ID!).pluginChild,
      servers: this.endpoints,
      waitOnFirstConnect: false,
      auth: {
        user: process.env.PROXY_USER!,
        password: process.env.PROXY_PASSWORD!,
      },
    });

    delete process.env.PROXY_USER;
    delete process.env.PROXY_PASSWORD;
    delete process.env.PROXY_ENDPOINTS;
    delete process.env.PROXY_CERT;
    delete process.env.PROXY_KEY;
    delete process.env.PROXY_CA;

    this.displayName = processName;

    this.loggerOptions = {
      prefix: this.displayName,
      debugEnabled: process.env.LOGGER_LEVEL === 'debug' || process.env.LOGGER_LEVEL === 'trace',
      traceEnabled: process.env.LOGGER_LEVEL === 'trace',
      targetId: process.env.PLUGIN_ID,
      targetType: 'plugin',
      pluginId: process.env.PLUGIN_ID,
    };

    this.logger = new Logger(this.loggerOptions);
    this.logger.setChildProcessMode(true);
    setupNodeAvLog(this.logger);

    this.signalHandler = new SignalHandler({
      displayName: '[Signal]',
      timeoutDuration: hostStopBudget(2000),
      logger: this.logger,
      reportErrors: WITH_REPORTS,
      reportDirectory: REPORT_DIR,
      ignoreSIGINT: hostSpeaksStopLine(),
      closeFunction: this.stopPlugin.bind(this),
    });
    listenForHostStop(this.signalHandler);
  }

  public async run(): Promise<void> {
    try {
      await this.proxy.connect();
      await this.onStart();
    } catch (error: any) {
      this.logger.error(`camera.ui not reachable on ${this.endpoints.join(', ')}: ${error?.message ?? error}`);
      process.exit(1);
    }
  }

  private async onStart(): Promise<void> {
    await this.openChannel();
    await this.sendReady(false);
  }

  private async openChannel(): Promise<void> {
    const channel = await this.proxy.privateChannel('plugin-communication', 'camera.ui');
    channel.on('message', this.onMessage.bind(this));
    channel.on('close', () => this.onChannelClose(channel));
    this.channel = channel;
  }

  private onChannelClose(channel: Channel): void {
    if (this.stopped || channel !== this.channel || !this.level2Master) {
      return;
    }
    this.openChannel().catch((error) => this.logger.warn('Could not open the channel to camera.ui again:', error));
  }

  private async startPlugin(data: ProcessLoadMessage, runId: string | undefined): Promise<void> {
    this.phase = 'starting';
    try {
      // on a worker the master's storage path from START points at the wrong machine
      const storagePath = process.env.PLUGIN_STORAGE_PATH ?? data.storage.storagePath;
      const pluginInfo = data.plugin;
      const cameras = data.cameras;

      this.pluginDb = await this.configurePluginDB(storagePath, pluginInfo.id);
      this.api = new PluginAPI(this.proxy, pluginInfo, storagePath, this.logger, this.pluginDb);
      await this.api.downloadManager.init();

      const PluginConstructor = await this.loadPlugin();
      const pluginStorage = await this.api._storageController.createStorage('plugin');
      this.plugin = new PluginConstructor(this.logger, this.api, pluginStorage);

      if (this.plugin.storageSchema && this.plugin.storageSchema.length > 0) {
        pluginStorage.defineSchemas(this.plugin.storageSchema);
      }

      const namespaces = NamespaceManager.pluginNamespaces(pluginInfo.id);
      this.closeProxy = await this.proxy.registerHandler(namespaces.pluginChildRpc, this.plugin, { withoutDecorators: true });

      if (process.env.PLUGIN_REMOTE_MODE) {
        this.fileServer = new PluginFileServer(this.proxy, pluginInfo.id);
        await this.fileServer.register();
      }

      this.api.deviceManager.setPlugin(this.plugin);
      this.api.sensorManager.setPlugin(this.plugin);

      await this.api.deviceManager.init();
      await this.api.coreManager.init();
      await this.configureCameras(this.api, pluginInfo, cameras);
      await this.api.sensorManager.init();
      await this.api.sensorManager.configureAdoptedSensors();

      this.phase = 'started';
      this.attachedRun = runId;
      await this.sendStarted(false);

      setImmediate(() => {
        this.api?.emit(API_EVENT.FINISH_LAUNCHING);
      });
    } catch (error: any) {
      this.phase = 'start-error';
      this.startError = error.message;
      await this.sendError(error.message);
      return;
    }

    await this.answerPendingResume();
  }

  private async reattach(data: ProcessLoadMessage, runId: string): Promise<void> {
    this.phase = 'reattaching';
    try {
      await this.runReattachSteps(data.cameras);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const message = `could not attach to the new camera.ui run: ${reason}`;
      this.phase = 'start-error';
      this.startError = message;
      this.logger.error(`Could not attach to the new camera.ui run: ${reason}`);
      await this.sendError(message, 'resume-mismatch');
      return;
    }

    this.phase = 'started';
    this.attachedRun = runId;
    this.logger.debug(`Attached to camera.ui run ${runId}`);
    await this.sendStarted(true);
    await this.answerPendingResume();
  }

  private async runReattachSteps(cameras: Camera[]): Promise<void> {
    const api = this.api;
    if (!api) {
      throw new Error('the plugin never started');
    }

    let steps: (() => Promise<unknown>)[] = [() => api.sensorManager.reattach(), () => api.deviceManager.reattach(cameras), async () => this.pluginDb?.flush?.()];
    const deadline = Date.now() + REATTACH_DEADLINE_MS;
    for (let attempt = 0; ; attempt++) {
      const failed: (() => Promise<unknown>)[] = [];
      let lastError: unknown;
      for (const step of steps) {
        try {
          await step();
        } catch (error) {
          failed.push(step);
          lastError = error;
        }
      }
      if (failed.length === 0) {
        return;
      }

      const delay = REATTACH_RETRY_DELAYS_MS[Math.min(attempt, REATTACH_RETRY_DELAYS_MS.length - 1)];
      if (Date.now() + delay > deadline) {
        throw lastError;
      }
      this.logger.debug(`Attaching to camera.ui failed, retrying in ${delay / 1000}s:`, lastError);
      await sleep(delay);
      steps = failed;
    }
  }

  private async onStartCommand(data: ProcessLoadMessage): Promise<void> {
    const runId = data.session?.runId;
    if (data.session) {
      this.level2Master = true;
    }

    if (this.phase === 'ready-sent') {
      await this.startPlugin(data, runId);
    } else if ((this.phase === 'started' || this.phase === 'reattach-wait') && runId && runId !== this.attachedRun) {
      await this.reattach(data, runId);
    } else {
      this.logger.debug(`Ignored START while ${this.phase}`);
    }
  }

  private async onResume(runId: string): Promise<void> {
    this.level2Master = true;
    switch (this.phase) {
      case 'ready-sent':
        await this.sendReady(false);
        break;
      case 'starting':
      case 'reattaching':
        this.pendingResume = runId;
        break;
      case 'started':
        if (runId === this.attachedRun) {
          await this.sendStarted(true);
          break;
        }
        this.phase = 'reattach-wait';
        await this.sendReady(true);
        break;
      case 'reattach-wait':
        await this.sendReady(true);
        break;
      case 'start-error':
        await this.sendError(this.startError ?? 'the plugin failed to start');
        break;
    }
  }

  private async answerPendingResume(): Promise<void> {
    const runId = this.pendingResume;
    this.pendingResume = undefined;
    if (runId !== undefined) {
      await this.onResume(runId);
    }
  }

  private async sendReady(resume: boolean): Promise<void> {
    await this.sendMessage({ type: PLUGIN_STATUS.READY, instanceId: this.instanceId, handshake: HANDSHAKE_LEVEL, resume });
  }

  private async sendStarted(resumed: boolean): Promise<void> {
    await this.sendMessage({ type: PLUGIN_STATUS.STARTED, instanceId: this.instanceId, runId: this.attachedRun, resumed: resumed || undefined });
  }

  private async sendError(error: string, code?: 'resume-mismatch'): Promise<void> {
    await this.sendMessage({ type: PLUGIN_STATUS.ERROR, error, instanceId: this.instanceId, code });
  }

  private async stopPlugin(): Promise<void> {
    if (this.stopped) {
      return;
    }

    this.stopped = true;

    await this.emitShutdownAndWait();
    await this.api?.sensorManager.close();
    await this.api?.deviceManager.close();
    await this.api?.coreManager.close();
    await this.api?.downloadManager.close();
    await this.api?._storageController.close();
    await this.pluginDb?.close?.();

    const teardown = (async () => {
      await this.fileServer?.close();
      await this.channel?.close();
      await this.closeProxy?.();
      await this.proxy.disconnect();
    })();

    let timer: NodeJS.Timeout | undefined;
    const timedOut = await Promise.race([
      teardown.then(
        () => false,
        () => false,
      ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(true), RPC_TEARDOWN_TIMEOUT);
      }),
    ]);
    clearTimeout(timer);

    if (timedOut) {
      this.logger.warn(`RPC teardown still pending after ${RPC_TEARDOWN_TIMEOUT}ms, force-closing transport`);
      this.proxy.abortClose();
    }
  }

  private async sendMessage(message: ProcessResponse): Promise<void> {
    try {
      await this.channel?.send<ProcessResponse>(message);
    } catch (error) {
      this.logger.debug(`Could not send ${message.type} to camera.ui:`, error);
    }
  }

  private async onMessage(message: ProcessMessage): Promise<void> {
    if (this.stopped) {
      return;
    }

    switch (message.type) {
      case PLUGIN_COMMAND.START:
        if (!message.data) {
          await this.sendError('No data provided');
          return;
        }

        // every instance listens on the channel, a START names its target
        if (message.data.session?.instanceId && this.instanceId && message.data.session.instanceId !== this.instanceId) {
          this.logger.debug(`Ignored START for instance ${message.data.session.instanceId}`);
          return;
        }

        await this.onStartCommand(message.data);
        break;
      case PLUGIN_COMMAND.RESUME:
        if (message.data?.instanceId && this.instanceId && message.data.instanceId !== this.instanceId) {
          return;
        }
        await this.onResume(message.data.runId);
        break;
      case PLUGIN_COMMAND.STOP:
        // exits too, nobody would watch a stopped plugin left running
        this.signalHandler.close('stop command');
        break;
    }
  }

  private async configurePluginDB(storagePath: string, pluginId: string): Promise<PluginConfigDb> {
    // config lives on the master so it survives a move to another worker
    if (process.env.PLUGIN_CONFIG_STORE_RPC) {
      const namespace = NamespaceManager.pluginNamespaces(pluginId).pluginConfigStoreRpc;
      const remoteDb = new RemotePluginConfigDb(
        this.proxy.createProxy<PluginConfigStoreRPC>(namespace),
        this.proxy.createProxy<PluginConfigStoreRPC>(namespace, { noResponderRetry: { maxRetries: 0 } }),
        storagePath,
        this.instanceId,
        this.logger,
      );
      await remoteDb.init();
      return remoteDb;
    }

    const store = new PluginStoreFile(`${storagePath}/volume`);
    await store.open();
    return new LocalPluginConfigDb(store);
  }

  private async configureCameras(api: PluginAPI, pluginInfo: PluginInfo, cameras: Camera[]): Promise<void> {
    const cameraDevices = cameras.map((camera) => {
      const cameraLogger = this.logger.createLogger({ suffix: camera.name, targetId: camera._id, targetType: 'camera' });
      return new CameraDeviceProxy(this.proxy, api._storageController, api.sensorManager, camera, pluginInfo, cameraLogger);
    });

    await this.api?.deviceManager.configureCameras(cameraDevices);
    await this.plugin?.configureCameras(cameraDevices);
  }

  private async loadPlugin(): Promise<PluginConstructor> {
    const moduleUrl = pathToFileURL(process.env.MODULE_PATH!).href;
    const mod = await import(moduleUrl);
    const isDefaultPromise = isPromise(mod.default);

    let defaultModule: any;

    if (isDefaultPromise) {
      defaultModule = await mod.default;
    } else {
      defaultModule = mod.default;
    }

    if (defaultModule && typeof defaultModule.default === 'function') {
      return defaultModule.default;
    } else if (typeof defaultModule === 'function') {
      return defaultModule;
    } else {
      throw new Error(`Plugin ${process.env.MODULE_PATH} does not export a initializer function from main.`);
    }
  }

  private async emitShutdownAndWait(): Promise<void> {
    if (!this.api) {
      return;
    }

    // detach first so once-wrappers can't fire twice
    const listeners = this.api.rawListeners(API_EVENT.SHUTDOWN) as ((...args: unknown[]) => unknown)[];
    this.api.removeAllListeners(API_EVENT.SHUTDOWN);

    if (listeners.length === 0) {
      return;
    }

    const settled = Promise.all(
      listeners.map(async (listener) => {
        try {
          await listener();
        } catch (error: any) {
          this.logger.error(`Shutdown listener failed: ${error.message}`);
        }
      }),
    );

    let timer: NodeJS.Timeout | undefined;
    const timedOut = await Promise.race([
      settled.then(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(true), SHUTDOWN_LISTENER_TIMEOUT);
      }),
    ]);
    clearTimeout(timer);

    if (timedOut) {
      this.logger.warn(`Shutdown listeners still pending after ${SHUTDOWN_LISTENER_TIMEOUT}ms, continuing teardown`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  forceServerNodeAv();
  const plugin = new PluginChild();
  await plugin.run();
}
