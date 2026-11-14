import { RPCMethod } from '@camera.ui/rpc';
import { randomUUID } from 'node:crypto';

import { NamespaceManager } from '../../../../rpc/namespaces.js';

import type { RPCClient } from '@camera.ui/rpc';
import type { PipeDownloadSource } from '@camera.ui/sdk';
import type { PipeState, PluginPipeInterface } from '../../../../rpc/interfaces/download.js';

// the transport takes 4 MB per message and other calls share the connection, smaller chunks cost more CPU per byte
const PIPE_CHUNK_SIZE = 1024 * 1024;
// the host asks about a running download every 15 s
const PIPE_LEASE_MS = 60 * 1000;

interface Pipe {
  source: PipeDownloadSource;
  expire: NodeJS.Timeout;
  running: boolean;
  waiting: boolean;
  heard: number;
}

export class PluginPipeServer implements PluginPipeInterface {
  #pipes = new Map<string, Pipe>();
  #closeHandler?: () => Promise<void>;

  constructor(
    private readonly proxy: RPCClient,
    private readonly pluginId: string,
    private readonly leaseMs = PIPE_LEASE_MS,
  ) {}

  public async register(): Promise<void> {
    const subject = NamespaceManager.pluginPipeRpc(this.pluginId);
    this.#closeHandler = await this.proxy.registerHandler(subject, this);
  }

  public async close(): Promise<void> {
    await this.#closeHandler?.();
    this.#closeHandler = undefined;
  }

  public add(source: PipeDownloadSource, ttlMs: number): string {
    const id = randomUUID();
    const expire = setTimeout(() => this.#pipes.delete(id), ttlMs);
    expire.unref();
    this.#pipes.set(id, { source, expire, running: false, waiting: false, heard: 0 });
    return id;
  }

  public drop(id: string): void {
    clearTimeout(this.#pipes.get(id)?.expire);
    this.#pipes.delete(id);
  }

  @RPCMethod
  public async *pullPipe(pipeId: string): AsyncGenerator<Uint8Array> {
    const pipe = this.#pipes.get(pipeId);
    if (!pipe || pipe.running) {
      throw new Error(`download ${pipeId} not found or expired`);
    }
    pipe.running = true;
    pipe.heard = Date.now();
    clearTimeout(pipe.expire);

    const controller = new AbortController();
    // a host that stopped asking never resumes this generator, the source learns it from the signal
    const lease = setInterval(() => {
      if (pipe.waiting && Date.now() - pipe.heard > this.leaseMs) {
        clearInterval(lease);
        controller.abort();
        this.#pipes.delete(pipeId);
      }
    }, this.leaseMs / 4);
    lease.unref();

    try {
      for await (const chunk of pipe.source(controller.signal)) {
        for (let offset = 0; offset < chunk.length; offset += PIPE_CHUNK_SIZE) {
          pipe.waiting = true;
          yield chunk.subarray(offset, offset + PIPE_CHUNK_SIZE);
          pipe.waiting = false;
          pipe.heard = Date.now();
        }
      }
    } finally {
      clearInterval(lease);
      controller.abort();
      this.#pipes.delete(pipeId);
    }
  }

  @RPCMethod
  public async pipeState(pipeId: string): Promise<PipeState> {
    const pipe = this.#pipes.get(pipeId);
    if (!pipe) return 'gone';
    pipe.heard = Date.now();
    return pipe.waiting ? 'waiting' : 'writing';
  }
}
