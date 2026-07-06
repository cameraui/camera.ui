import type { Promisify } from '@camera.ui/rpc';
import type { PluginConfigStoreRPC } from '../../config-store.js';

export interface PluginConfigDb {
  get(key: 'config'): Record<string, any> | undefined;
  put(key: 'config', value: Record<string, any>): Promise<unknown>;
  close?(): Promise<unknown>;
}

export class RemotePluginConfigDb implements PluginConfigDb {
  #cache: Record<string, any> = {};

  constructor(private readonly store: Promisify<PluginConfigStoreRPC>) {}

  public async init(): Promise<void> {
    this.#cache = (await this.store.get()) ?? {};
  }

  public get(_key: 'config'): Record<string, any> {
    return this.#cache;
  }

  public async put(_key: 'config', value: Record<string, any>): Promise<void> {
    this.#cache = value;
    await this.store.put(value);
  }
}
