import { NamespaceManager } from '../../../../rpc/namespaces.js';

import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type { CreateDownloadOptions, CreateStreamDownloadOptions, DownloadManager, DownloadToken } from '@camera.ui/sdk';
import type { DownloadManagerInterface } from '../../../../rpc/interfaces/download.js';
import type { DownloadManagerNamespaces } from '../../../../rpc/namespaces.js';

export class DownloadManagerProxy implements DownloadManager {
  #proxy: RPCClient;
  #namespaces: DownloadManagerNamespaces;
  #remotePluginId?: string;

  get #downloadManagerProxy(): Promisify<DownloadManagerInterface> {
    return this.#proxy.createProxy<DownloadManagerInterface>(this.#namespaces.downloadManagerRpc);
  }

  constructor(proxy: RPCClient) {
    this.#proxy = proxy;
    this.#namespaces = NamespaceManager.downloadManagerNamespaces();

    if (process.env.PLUGIN_REMOTE_MODE) {
      this.#remotePluginId = process.env.PLUGIN_ID;
    }
  }

  async createDownload(options: CreateDownloadOptions): Promise<DownloadToken> {
    return await this.#downloadManagerProxy.createDownload({ ...options, remotePluginId: this.#remotePluginId });
  }

  async createStreamDownload(options: CreateStreamDownloadOptions): Promise<DownloadToken> {
    return await this.#downloadManagerProxy.createStreamDownload({ ...options, remotePluginId: this.#remotePluginId });
  }

  async deleteDownload(token: string): Promise<void> {
    return await this.#downloadManagerProxy.deleteDownload(token);
  }
}
