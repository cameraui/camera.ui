import { RPCMethod } from '@camera.ui/rpc';
import { randomUUID } from 'node:crypto';

import { NamespaceManager } from '../../../../rpc/namespaces.js';

import type { RPCClient } from '@camera.ui/rpc';
import type { PipeDownloadSource } from '@camera.ui/sdk';
import type { PipeState, PluginPipeInterface } from '../../../../rpc/interfaces/download.js';

// the transport takes 4 MB per message and other calls share the connection, smaller chunks cost more CPU per byte
const PIPE_CHUNK_SIZE = 1024 * 1024;
// a slow source does not hold its bytes back until a chunk is full
const PIPE_FLUSH_MS = 50;
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
      for await (const chunk of fillChunks(pipe.source(controller.signal))) {
        pipe.waiting = true;
        yield chunk;
        pipe.waiting = false;
        pipe.heard = Date.now();
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

// eslint-disable-next-line @stylistic/generator-star-spacing
async function* fillChunks(source: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
  const iterator = source[Symbol.asyncIterator]();
  let parts: Uint8Array[] = [];
  let size = 0;
  let since = 0;
  let read: Promise<IteratorResult<Uint8Array>> | undefined;

  const take = (): Uint8Array => {
    const chunk = parts.length === 1 ? parts[0] : Buffer.concat(parts, size);
    parts = [];
    size = 0;
    return chunk;
  };

  try {
    for (;;) {
      // checked here too, a source that never waits would keep the timer from firing
      if (size > 0 && Date.now() - since >= PIPE_FLUSH_MS) {
        yield take();
        continue;
      }
      read ??= iterator.next();
      const step = size === 0 ? await read : await within(read, since + PIPE_FLUSH_MS - Date.now());
      if (!step) {
        yield take();
        continue;
      }
      read = undefined;
      if (step.done) break;

      const chunk = step.value;
      let offset = 0;
      if (size > 0) {
        offset = Math.min(chunk.length, PIPE_CHUNK_SIZE - size);
        parts.push(Buffer.from(chunk.subarray(0, offset)));
        size += offset;
        if (size === PIPE_CHUNK_SIZE) yield take();
      }
      for (; chunk.length - offset >= PIPE_CHUNK_SIZE; offset += PIPE_CHUNK_SIZE) {
        yield chunk.subarray(offset, offset + PIPE_CHUNK_SIZE);
      }
      if (offset < chunk.length) {
        // copied, the source may fill the same buffer again before the chunk goes out
        parts.push(Buffer.from(chunk.subarray(offset)));
        size = chunk.length - offset;
        since = Date.now();
      }
    }
    if (size > 0) yield take();
  } finally {
    const closed = iterator.return?.();
    // a read that is still open ends with the abort that follows, not before it
    if (read) closed?.catch(() => {});
    else await closed;
  }
}

function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
