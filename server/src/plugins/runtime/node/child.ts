import { Logger } from '@camera.ui/common/logger';
import { SignalHandler } from '@camera.ui/common/utils';
import { createRPCClient } from '@camera.ui/rpc';
import { API_EVENT } from '@camera.ui/sdk';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isPromise } from 'node:util/types';

import { NamespaceManager } from '../../../rpc/namespaces.js';
import { PluginStoreFile } from '../../store/pluginStoreFile.js';
import { PLUGIN_COMMAND, PLUGIN_STATUS } from '../../types.js';
import { LocalPluginConfigDb, RemotePluginConfigDb } from './configDb.js';
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

const SHUTDOWN_LISTENER_TIMEOUT = 1000;
const RPC_TEARDOWN_TIMEOUT = 500;

const processName = process.argv[3] || process.argv[2] || 'Plugin';
process.title = `camera.ui - ${processName}`;

export class PluginChild {
  private proxy: RPCClient;
  private channel?: Channel;

  private displayName: string;
  private api?: PluginAPI;
  private plugin?: BasePlugin;
  private closeProxy?: () => Promise<void>;
  private pluginDb?: PluginConfigDb;
  private fileServer?: PluginFileServer;
  private signalHandler: SignalHandler;

  private logger: Logger;
  private loggerOptions: LoggerOptions;

  private stopped = false;
  constructor() {
    this.proxy = createRPCClient({
      name: NamespaceManager.pluginNamespaces(process.env.PLUGIN_ID!).pluginChild,
      servers: process.env.PROXY_ENDPOINTS!.split(','),
      auth: {
        user: process.env.PROXY_USER!,
        password: process.env.PROXY_PASSWORD!,
      },
      // tls: {
      //   cert: process.env.PROXY_CERT!,
      //   key: process.env.PROXY_KEY!,
      //   ca: process.env.PROXY_CA!,
      // },
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

    this.signalHandler = new SignalHandler({
      displayName: '[Signal]',
      timeoutDuration: 2000,
      logger: this.logger,
      closeFunction: this.stopPlugin.bind(this),
    });
  }

  public async run(): Promise<void> {
    try {
      await this.proxy.connect();
      await this.onStart();
    } catch (error: any) {
      this.logger.error(`Failed to connect to proxy server: ${error.message}`);
      process.exit(1);
    }
  }

  private async onStart(): Promise<void> {
    this.channel = await this.proxy.privateChannel('plugin-communication', 'camera.ui');
    this.channel.on('message', this.onMessage.bind(this));
    await this.sendMessage({ type: PLUGIN_STATUS.READY });
  }

  private async startPlugin(data: ProcessLoadMessage): Promise<void> {
    try {
      // Host-local writable dir — on a remote worker the master's path from
      // the START message would point at the wrong machine.
      const storagePath = process.env.PLUGIN_STORAGE_PATH ?? data.storage.storagePath;
      const pluginInfo = data.plugin;
      const cameras = data.cameras;

      this.pluginDb = await this.configurePluginDB(storagePath, pluginInfo.id);
      this.api = new PluginAPI(this.proxy, pluginInfo, storagePath, this.logger, this.pluginDb);

      const PluginConstructor = await this.loadPlugin();
      const pluginStorage = await this.api._storageController.createStorage('plugin');
      this.plugin = new PluginConstructor(this.logger, this.api, pluginStorage);

      if (this.plugin.storageSchema && this.plugin.storageSchema.length > 0) {
        pluginStorage.defineSchemas(this.plugin.storageSchema);
      }

      const namespaces = NamespaceManager.pluginNamespaces(pluginInfo.id);
      this.closeProxy = await this.proxy.registerHandler(namespaces.pluginChildRpc, this.plugin, { withoutDecorators: true });

      // Remote-hosted: serve this worker's files so the master can stream
      // downloads/exports of them.
      if (process.env.PLUGIN_REMOTE_MODE) {
        this.fileServer = new PluginFileServer(this.proxy, pluginInfo.id);
        await this.fileServer.register();
      }

      this.api.deviceManager.setPlugin(this.plugin);

      await this.api.deviceManager.init();
      await this.api.coreManager.init();
      await this.configureCameras(this.api, pluginInfo, cameras);

      this.sendMessage({ type: PLUGIN_STATUS.STARTED });

      setImmediate(() => {
        this.api?.emit(API_EVENT.FINISH_LAUNCHING);
      });
    } catch (error: any) {
      this.sendMessage({ type: PLUGIN_STATUS.ERROR, error: error.message });
    }
  }

  private async stopPlugin(): Promise<void> {
    if (this.stopped) {
      return;
    }

    this.stopped = true;

    await this.emitShutdownAndWait();
    await this.api?.deviceManager.close();
    await this.api?.coreManager.close();
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
    await this.channel?.send<ProcessResponse>(message);
  }

  private async onMessage(message: ProcessMessage): Promise<void> {
    if (this.stopped) {
      return;
    }

    switch (message.type) {
      case PLUGIN_COMMAND.START:
        if (!message.data) {
          this.sendMessage({ type: PLUGIN_STATUS.ERROR, error: 'No data provided' });
          return;
        }

        this.startPlugin(message.data);
        break;
      case PLUGIN_COMMAND.STOP:
        this.stopPlugin();
        break;
    }
  }

  private async configurePluginDB(storagePath: string, pluginId: string): Promise<PluginConfigDb> {
    // Remote-hosted: config lives on the master (re-homing safe) — persist
    // through its config store instead of a worker-local file.
    if (process.env.PLUGIN_CONFIG_STORE_RPC) {
      const namespaces = NamespaceManager.pluginNamespaces(pluginId);
      const remoteDb = new RemotePluginConfigDb(this.proxy.createProxy<PluginConfigStoreRPC>(namespaces.pluginConfigStoreRpc));
      await remoteDb.init();
      return remoteDb;
    }

    const store = new PluginStoreFile(`${storagePath}/volume`, pluginId);
    await store.open();
    return new LocalPluginConfigDb(store);
  }

  private async configureCameras(api: PluginAPI, pluginInfo: PluginInfo, cameras: Camera[]): Promise<void> {
    const cameraDevices = cameras.map((camera) => {
      const cameraLogger = this.logger.createLogger({ suffix: camera.name, targetId: camera._id, targetType: 'camera' });
      return new CameraDeviceProxy(this.proxy, api._storageController, camera, pluginInfo, cameraLogger);
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

    // Detach before invoking so once-wrappers cannot fire a second time.
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
  const plugin = new PluginChild();
  await plugin.run();
}
