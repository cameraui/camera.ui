import { Subject } from '@camera.ui/sdk';

import { NamespaceManager } from '../../../../rpc/namespaces.js';

import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type { BasePlugin, CoreManager, CoreManagerEvent, Observable, PluginInfo, PluginInterface, PluginInterfaces } from '@camera.ui/sdk';
import type { CoreManagerInterface, CoreManagerListenerMessagePayload } from '../../../../rpc/interfaces/core.js';
import type { CoreManagerNamespaces, PluginNamespaces } from '../../../../rpc/namespaces.js';

export class CoreManagerProxy implements CoreManager {
  readonly onEvent: Observable<CoreManagerEvent>;

  #proxy: RPCClient;
  #plugin: PluginInfo;

  #initialized = false;

  #closeSubscription?: () => void;
  #namespaces: CoreManagerNamespaces & PluginNamespaces;

  #rpcConnections = new Map<string, { proxy: Promisify<BasePlugin & PluginInterfaces>; close: () => Promise<void> }>();

  #eventSubject = new Subject<CoreManagerEvent>();

  constructor(proxy: RPCClient, plugin: PluginInfo) {
    this.#proxy = proxy;
    this.#plugin = plugin;
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

  public async connectToPlugin(pluginName: string): Promise<(BasePlugin & PluginInterfaces) | undefined> {
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

      // Cast to interface type - RPC proxy exposes methods correctly at runtime
      return rpcConnection.proxy;
    } catch {
      return undefined;
    }
  }

  public async getFFmpegPath(): Promise<string> {
    // Remote-hosted: the master's path points at the wrong machine — the
    // worker injects its own bundled ffmpeg at spawn time.
    if (process.env.CAMERAUI_FFMPEG_PATH) {
      return process.env.CAMERAUI_FFMPEG_PATH;
    }
    return await this.#coreManagerProxy.getFFmpegPath();
  }

  public async getServerAddresses(): Promise<string[]> {
    return await this.#coreManagerProxy.getServerAddresses();
  }

  public async getCloudServerId(): Promise<string> {
    return await this.#coreManagerProxy.getCloudServerId();
  }

  public async getPluginsByInterface(interfaceName: PluginInterface): Promise<PluginInfo[]> {
    return await this.#coreManagerProxy.getPluginsByInterface(interfaceName);
  }

  /** Internal method to close the core manager proxy */
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
    await Promise.allSettled(Array.from(this.#rpcConnections.values()).map((rpcConnection) => rpcConnection.close()));
  }
}
