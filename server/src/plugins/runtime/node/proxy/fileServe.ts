import { close, open, read, stat, unlink } from 'node:fs';
import { promisify } from 'node:util';

import { RPCClass, RPCMethod } from '@camera.ui/rpc';

import { NamespaceManager } from '../../../../rpc/namespaces.js';

import type { RPCClient } from '@camera.ui/rpc';
import type { FileServeStat, PluginFileServeInterface } from '../../../../rpc/interfaces/download.js';

const statAsync = promisify(stat);
const openAsync = promisify(open);
const readAsync = promisify(read);
const closeAsync = promisify(close);
const unlinkAsync = promisify(unlink);

@RPCClass
export class PluginFileServer implements PluginFileServeInterface {
  #closeHandler?: () => Promise<void>;

  constructor(
    private readonly proxy: RPCClient,
    private readonly pluginId: string,
  ) {}

  public async register(): Promise<void> {
    const subject = NamespaceManager.pluginFileServeRpc(this.pluginId);
    this.#closeHandler = await this.proxy.registerHandler(subject, this, { withoutDecorators: true });
  }

  public async close(): Promise<void> {
    await this.#closeHandler?.();
    this.#closeHandler = undefined;
  }

  @RPCMethod
  public async statFile(filePath: string): Promise<FileServeStat> {
    try {
      const stats = await statAsync(filePath);
      return { exists: stats.isFile(), size: stats.size };
    } catch {
      return { exists: false, size: 0 };
    }
  }

  @RPCMethod
  public async readFileChunk(filePath: string, offset: number, length: number): Promise<Uint8Array> {
    const fd = await openAsync(filePath, 'r');
    try {
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await readAsync(fd, buffer, 0, length, offset);
      return buffer.subarray(0, bytesRead);
    } finally {
      await closeAsync(fd);
    }
  }

  @RPCMethod
  public async deleteFile(filePath: string): Promise<void> {
    await unlinkAsync(filePath).catch(() => {});
  }
}
