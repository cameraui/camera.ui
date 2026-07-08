import { join } from 'node:path';

import { NamespaceManager } from '../rpc/namespaces.js';
import { PluginStoreFile } from './store/pluginStoreFile.js';

import type { RPCClient } from '@camera.ui/rpc';

export interface PluginConfigStoreRPC {
  get(): Promise<Record<string, any>>;
  put(config: Record<string, any>): Promise<void>;
}

export class PluginConfigStore implements PluginConfigStoreRPC {
  private store?: PluginStoreFile;
  private closeHandler?: () => Promise<void>;

  constructor(
    private readonly pluginId: string,
    private readonly storagePath: string,
  ) {}

  public async register(proxy: RPCClient): Promise<void> {
    this.store = new PluginStoreFile(join(this.storagePath, 'volume'), this.pluginId);
    await this.store.open();

    const namespaces = NamespaceManager.pluginNamespaces(this.pluginId);
    this.closeHandler = await proxy.registerHandler(
      namespaces.pluginConfigStoreRpc,
      { get: () => this.get(), put: (config: Record<string, any>) => this.put(config) },
      { withoutDecorators: true },
    );
  }

  public async close(): Promise<void> {
    await this.closeHandler?.();
    this.closeHandler = undefined;
    await this.store?.close();
    this.store = undefined;
  }

  public async get(): Promise<Record<string, any>> {
    if (!this.store) {
      // An empty result here would boot the plugin with default config while
      // its real data sits in the closed store. Fail loudly instead.
      throw new Error(`store: config store for ${this.pluginId} is closed`);
    }
    return this.store.get();
  }

  public async put(config: Record<string, any>): Promise<void> {
    if (!this.store) {
      throw new Error(`store: config store for ${this.pluginId} is closed`);
    }
    await this.store.put(config);
  }
}
