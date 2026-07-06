import { open } from 'lmdb';

import { NamespaceManager } from '../rpc/namespaces.js';

import type { RPCClient } from '@camera.ui/rpc';
import type { RootDatabase } from 'lmdb';

export interface PluginConfigStoreRPC {
  get(): Promise<Record<string, any>>;
  put(config: Record<string, any>): Promise<void>;
}

export class PluginConfigStore implements PluginConfigStoreRPC {
  private db?: RootDatabase<Record<string, any>, 'config'>;
  private closeHandler?: () => Promise<void>;

  constructor(
    private readonly pluginId: string,
    private readonly storagePath: string,
  ) {}

  public async register(proxy: RPCClient): Promise<void> {
    this.db = open(`${this.storagePath}/volume`, { name: 'plugins' });

    if (!this.db.get('config')) {
      await this.db.put('config', {});
    }

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
    await this.db?.close();
    this.db = undefined;
  }

  public async get(): Promise<Record<string, any>> {
    return this.db?.get('config') ?? {};
  }

  public async put(config: Record<string, any>): Promise<void> {
    await this.db?.put('config', config);
  }
}
