import { Subject } from '@camera.ui/sdk';

import { NamespaceManager } from '../../../../rpc/namespaces.js';

import type { Logger } from '@camera.ui/common';
import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type {
  AssistantAccess,
  AssistantAskResult,
  BasePlugin,
  CoreManager,
  CoreManagerEvent,
  Observable,
  PluginCallOptions,
  PluginInfo,
  PluginInterface,
  PluginInterfaces,
} from '@camera.ui/sdk';
import type { AssistantAskRequest } from '../../../../assistant/types.js';
import type { CoreManagerInterface, CoreManagerListenerMessagePayload } from '../../../../rpc/interfaces/core.js';
import type { CoreManagerNamespaces, PluginNamespaces } from '../../../../rpc/namespaces.js';

export class CoreManagerProxy implements CoreManager {
  readonly onEvent: Observable<CoreManagerEvent>;

  #proxy: RPCClient;
  #plugin: PluginInfo;
  #logger: Logger;

  #initialized = false;

  #closeSubscription?: () => void;
  #namespaces: CoreManagerNamespaces & PluginNamespaces;

  #rpcConnections = new Map<string, { proxy: Promisify<BasePlugin & PluginInterfaces>; close: () => Promise<void> }>();
  #callProxies = new Map<string, Promisify<BasePlugin & PluginInterfaces>>();

  #eventSubject = new Subject<CoreManagerEvent>();

  constructor(proxy: RPCClient, plugin: PluginInfo, logger: Logger) {
    this.#proxy = proxy;
    this.#plugin = plugin;
    this.#logger = logger;
    this.#namespaces = {
      ...NamespaceManager.coreManagerNamespaces(),
      ...NamespaceManager.pluginNamespaces(this.#plugin.id),
    };

    this.onEvent = this.#eventSubject.asObservable();
  }

  get #coreManagerProxy(): Promisify<CoreManagerInterface> {
    return this.#proxy.createProxy<CoreManagerInterface>(this.#namespaces.coreManagerRpc);
  }

  public async init(): Promise<void> {
    if (this.#initialized) {
      return;
    }

    this.#initialized = true;
    this.#closeSubscription = await this.#proxy.subscribe<CoreManagerListenerMessagePayload>(this.#namespaces.coreManagerSubject, this.#onEventMessage.bind(this));
  }

  public async connectToPlugin(pluginName: string, options?: PluginCallOptions): Promise<(BasePlugin & PluginInterfaces) | undefined> {
    try {
      const plugin = await this.#coreManagerProxy.getPlugin(pluginName);

      if (!plugin) {
        return;
      }

      const namespaces = NamespaceManager.pluginNamespaces(plugin.id);
      let rpcConnection: { proxy: Promisify<BasePlugin & PluginInterfaces>; close: () => Promise<void> };

      if (this.#rpcConnections.has(namespaces.pluginChildRpc)) {
        rpcConnection = this.#rpcConnections.get(namespaces.pluginChildRpc)!;
      } else {
        rpcConnection = this.#proxy.createProxy(namespaces.pluginChildRpc, { isolatedConnection: true });
        this.#rpcConnections.set(namespaces.pluginChildRpc, rpcConnection);
      }

      const timeout = options?.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : undefined;
      const noRetry = options?.noRetry === true;

      if (timeout === undefined && !noRetry) {
        return rpcConnection.proxy;
      }

      const key = `${namespaces.pluginChildRpc}|${timeout ?? ''}|${noRetry}`;
      let callProxy = this.#callProxies.get(key);

      if (!callProxy) {
        // the get trap answers every property with a remote method, read the client off the target
        const client = (Object.getOwnPropertyDescriptor(rpcConnection.proxy, '_isolatedClient')?.value as RPCClient | undefined) ?? this.#proxy;
        callProxy = client.createProxy<BasePlugin & PluginInterfaces>(namespaces.pluginChildRpc, {
          isolatedConnection: false,
          timeout,
          noResponderRetry: noRetry ? { maxRetries: 0 } : undefined,
        });
        this.#callProxies.set(key, callProxy);
      }

      return callProxy;
    } catch (error) {
      this.#logger.error(`Could not connect to plugin "${pluginName}":`, error);
      return undefined;
    }
  }

  public async getFFmpegPath(): Promise<string> {
    // on a worker the master's ffmpeg path is wrong, the worker injects its own
    if (process.env.CAMERAUI_FFMPEG_PATH) {
      return process.env.CAMERAUI_FFMPEG_PATH;
    }
    return await this.#coreManagerProxy.getFFmpegPath();
  }

  public async getServerAddresses(): Promise<string[]> {
    return await this.#coreManagerProxy.getServerAddresses(this.#plugin.id);
  }

  public async getCloudServerId(): Promise<string> {
    return await this.#coreManagerProxy.getCloudServerId();
  }

  public async getRestoreGeneration(): Promise<string> {
    return await this.#coreManagerProxy.getRestoreGeneration();
  }

  public async getInstanceId(): Promise<string> {
    return await this.#coreManagerProxy.getInstanceId();
  }

  public async getLanguage(): Promise<string> {
    return await this.#coreManagerProxy.getLanguage();
  }

  public async getPluginsByInterface(interfaceName: PluginInterface): Promise<PluginInfo[]> {
    return await this.#coreManagerProxy.getPluginsByInterface(interfaceName);
  }

  public async assistantAsk(request: Omit<AssistantAskRequest, 'pluginId'>): Promise<AssistantAskResult> {
    return await this.#coreManagerProxy.assistantAsk({ ...request, pluginId: this.#plugin.id });
  }

  public async assistantAccess(): Promise<AssistantAccess> {
    return await this.#coreManagerProxy.assistantAccess(this.#plugin.id);
  }

  public async close(): Promise<void> {
    this.#initialized = false;
    this.#eventSubject.complete();
    this.#closeSubscription?.();
    await this.#disconnectRpc();
  }

  async #onEventMessage(event: CoreManagerListenerMessagePayload): Promise<void> {
    const { type, data } = event;
    if (!type) return;
    this.#eventSubject.next({ type, data });
  }

  async #disconnectRpc(): Promise<void> {
    const rpcConnections = Array.from(this.#rpcConnections.values());
    this.#rpcConnections.clear();
    this.#callProxies.clear();
    await Promise.allSettled(rpcConnections.map((rpcConnection) => rpcConnection.close()));
  }
}
