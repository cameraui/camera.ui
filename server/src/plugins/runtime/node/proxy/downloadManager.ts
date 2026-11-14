import { NamespaceManager } from '../../../../rpc/namespaces.js';
import { PluginPipeServer } from './pipeServe.js';

import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type {
  CreateDownloadOptions,
  CreatePipeDownloadOptions,
  CreateStreamDownloadOptions,
  DownloadManager,
  DownloadToken,
  PipeDownloadSource,
  PluginInfo,
} from '@camera.ui/sdk';
import type { DownloadManagerInterface } from '../../../../rpc/interfaces/download.js';
import type { DownloadManagerNamespaces } from '../../../../rpc/namespaces.js';

const DEFAULT_PIPE_TTL_MS = 10 * 60 * 1000;

export class DownloadManagerProxy implements DownloadManager {
  #proxy: RPCClient;
  #namespaces: DownloadManagerNamespaces;
  #pluginId: string;
  #remotePluginId?: string;
  #pipes: PluginPipeServer;

  get #downloadManagerProxy(): Promisify<DownloadManagerInterface> {
    return this.#proxy.createProxy<DownloadManagerInterface>(this.#namespaces.downloadManagerRpc);
  }

  constructor(proxy: RPCClient, plugin: PluginInfo) {
    this.#proxy = proxy;
    this.#namespaces = NamespaceManager.downloadManagerNamespaces();
    this.#pluginId = plugin.id;
    this.#pipes = new PluginPipeServer(proxy, plugin.id);

    if (process.env.PLUGIN_REMOTE_MODE) {
      this.#remotePluginId = process.env.PLUGIN_ID;
    }
  }

  public async init(): Promise<void> {
    await this.#pipes.register();
  }

  public async close(): Promise<void> {
    await this.#pipes.close();
  }

  async createDownload(options: CreateDownloadOptions): Promise<DownloadToken> {
    return await this.#downloadManagerProxy.createDownload({ ...options, remotePluginId: this.#remotePluginId });
  }

  async createStreamDownload(options: CreateStreamDownloadOptions): Promise<DownloadToken> {
    return await this.#downloadManagerProxy.createStreamDownload({ ...options, remotePluginId: this.#remotePluginId });
  }

  public async createPipeDownload(options: CreatePipeDownloadOptions, source: PipeDownloadSource): Promise<DownloadToken> {
    const pipeId = this.#pipes.add(source, options.ttlMs ?? DEFAULT_PIPE_TTL_MS);
    try {
      return await this.#downloadManagerProxy.createPipeDownload({ ...options, pluginId: this.#pluginId, pipeId });
    } catch (error) {
      this.#pipes.drop(pipeId);
      throw error;
    }
  }

  async deleteDownload(token: string): Promise<void> {
    return await this.#downloadManagerProxy.deleteDownload(token);
  }
}
