import { IS_ELECTRON } from '@camera.ui/common/utils';
import { RPCClass, RPCMethod } from '@camera.ui/rpc';
import pty from '@scrypted/node-pty';
import { randomUUID } from 'node:crypto';
import { container } from 'tsyringe';

import { NamespaceManager } from '../rpc/namespaces.js';

import type { IPty } from '@scrypted/node-pty';
import type { ProxyServer } from '../rpc/index.js';
import type {
  TerminalManagerInterface,
  TerminalManagerProxyEvents,
  TerminalManagerProxyGenericEvent,
  TerminalOptions,
  TerminalSessionInfo,
} from '../rpc/interfaces/terminal.js';
import type { LoggerService } from '../services/logger/index.js';

class AsyncQueue<T> {
  private queue: T[] = [];
  private resolvers: ((value: IteratorResult<T>) => void)[] = [];
  private closed = false;

  async enqueue(item: T): Promise<void> {
    if (this.closed) return;

    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve({ value: item, done: false });
    } else {
      this.queue.push(item);
    }
  }

  end(): void {
    this.closed = true;
    for (const resolve of this.resolvers) {
      resolve({ value: undefined, done: true });
    }
    this.resolvers = [];
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.queue.length > 0) {
          return Promise.resolve({ value: this.queue.shift()!, done: false });
        }

        if (this.closed) {
          return Promise.resolve({ value: undefined as unknown as T, done: true });
        }

        return new Promise((resolve) => {
          this.resolvers.push(resolve);
        });
      },
    };
  }
}

interface TerminalSession {
  sessionId: string;
  pty: IPty;
  outputQueue: AsyncQueue<Uint8Array>;
  dimensions: { cols: number; rows: number };
  closed: boolean;
  lastActivity: Date;
}

@RPCClass
export class TerminalManager implements TerminalManagerInterface {
  private proxyServer: ProxyServer;
  private logger: LoggerService;

  private sessions = new Map<string, TerminalSession>();
  private namespaces = NamespaceManager.terminalManagerNamespaces();
  private closeProxy?: () => Promise<void>;

  private static readonly BACKPRESSURE_THRESHOLD = 64 * 1024;
  private static readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000;
  private static readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

  private static readonly ALLOWED_SHELLS =
    process.platform === 'win32'
      ? new Set(['cmd.exe', 'powershell.exe', 'pwsh.exe'])
      : new Set(['/bin/bash', '/bin/sh', '/bin/zsh', '/usr/bin/bash', '/usr/bin/sh', '/usr/bin/zsh', '/usr/bin/fish']);

  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    this.proxyServer = container.resolve<ProxyServer>('proxy');
    this.logger = container.resolve<LoggerService>('logger');
  }

  public async register(): Promise<void> {
    this.closeProxy = await this.proxyServer.proxy.registerHandler(this.namespaces.terminalManagerRpc, this);

    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions();
    }, TerminalManager.CLEANUP_INTERVAL_MS);
  }

  public async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    for (const [sessionId] of this.sessions) {
      await this.closeSession(sessionId);
    }

    await this.closeProxy?.();
  }

  public publishTerminalManagerEvent<K extends keyof TerminalManagerProxyEvents>(type: K, data: TerminalManagerProxyEvents[K]): void {
    const event: TerminalManagerProxyGenericEvent<K> = { type, data };
    this.proxyServer.proxy.publish(this.namespaces.terminalManagerSubject, event);
  }

  @RPCMethod
  public async createSession(options?: TerminalOptions): Promise<TerminalSessionInfo> {
    if (IS_ELECTRON) {
      throw new Error('Terminal is disabled in the desktop app');
    }

    if (options?.shell && !TerminalManager.ALLOWED_SHELLS.has(options.shell)) {
      throw new Error(`Shell not allowed: ${options.shell}`);
    }

    const sessionId = randomUUID();
    const shell = options?.shell ?? this.getDefaultShell();
    const cols = options?.cols ?? 80;
    const rows = options?.rows ?? 24;

    this.logger.trace(`Creating terminal session ${sessionId} with shell: ${shell}`);

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: options?.cwd ?? process.cwd(),
      env: {
        ...process.env,
        ...options?.env,
        COLORTERM: 'truecolor',
        TERM: 'xterm-256color',
      },
    });

    const outputQueue = new AsyncQueue<Uint8Array>();
    let bufferedLength = 0;
    let isPaused = false;

    const session: TerminalSession = {
      sessionId,
      pty: ptyProcess,
      outputQueue,
      dimensions: { cols, rows },
      closed: false,
      lastActivity: new Date(),
    };

    ptyProcess.onData((data) => {
      if (session.closed) return;

      const buffer = Buffer.from(data);
      bufferedLength += buffer.length;

      outputQueue.enqueue(buffer).then(() => {
        bufferedLength -= buffer.length;

        if (isPaused && bufferedLength < TerminalManager.BACKPRESSURE_THRESHOLD / 2) {
          isPaused = false;
          ptyProcess.resume?.();
        }
      });

      if (!isPaused && bufferedLength >= TerminalManager.BACKPRESSURE_THRESHOLD) {
        isPaused = true;
        ptyProcess.pause?.();
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      this.logger.trace(`Terminal session ${sessionId} exited with code ${exitCode}`);
      session.closed = true;
      outputQueue.end();
      this.sessions.delete(sessionId);
      this.publishTerminalManagerEvent('sessionClosed', { sessionId });
    });

    this.sessions.set(sessionId, session);

    return {
      sessionId,
      pid: ptyProcess.pid,
      dimensions: { cols, rows },
    };
  }

  @RPCMethod
  public async *generateOutput(sessionId: string): AsyncGenerator<Uint8Array> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    for await (const chunk of session.outputQueue) {
      yield chunk;
    }
  }

  @RPCMethod
  public async writeInput(sessionId: string, data: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.closed) {
      throw new Error(`Session not found or closed: ${sessionId}`);
    }

    session.lastActivity = new Date();
    session.pty.write(data);
  }

  @RPCMethod
  public async resize(sessionId: string, dimensions: { cols: number; rows: number }): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.closed) return;

    session.pty.resize(dimensions.cols, dimensions.rows);
    session.dimensions = dimensions;
  }

  @RPCMethod
  public async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.logger.trace(`Closing terminal session ${sessionId}`);
    session.closed = true;
    session.pty.kill();
    session.outputQueue.end();
    this.sessions.delete(sessionId);
  }

  private getDefaultShell(): string {
    if (process.platform === 'win32') {
      return process.env.COMSPEC ?? 'cmd.exe';
    }
    return process.env.SHELL ?? '/bin/bash';
  }

  private cleanupInactiveSessions(): void {
    const now = Date.now();

    for (const [sessionId, session] of this.sessions) {
      const inactiveTime = now - session.lastActivity.getTime();

      if (inactiveTime > TerminalManager.SESSION_TIMEOUT_MS) {
        this.logger.trace(`Cleaning up inactive terminal session ${sessionId} (inactive for ${Math.round(inactiveTime / 1000 / 60)} minutes)`);
        this.closeSession(sessionId);
      }
    }
  }
}
