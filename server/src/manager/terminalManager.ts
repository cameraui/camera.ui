import { IS_ELECTRON } from '@camera.ui/common/utils';
import { RPCMethod, sessionSignal } from '@camera.ui/rpc';
import pty from '@seydx/node-pty';
import { SerializeAddon } from '@xterm/addon-serialize';
import xtermHeadless from '@xterm/headless';
import { randomUUID } from 'node:crypto';

import { inject } from '../container.js';
import { NamespaceManager } from '../rpc/namespaces.js';

import type { IPty } from '@seydx/node-pty';
import type { Terminal } from '@xterm/headless';
import type { ProxyServer } from '../rpc/index.js';
import type {
  TerminalManagerInterface,
  TerminalManagerProxyEvents,
  TerminalManagerProxyGenericEvent,
  TerminalOptions,
  TerminalSessionInfo,
  TerminalSessionUpdate,
} from '../rpc/interfaces/terminal.js';
import type { LoggerService } from '../services/logger/index.js';

class OutputQueue {
  public bytes = 0;

  private chunks: Uint8Array[] = [];
  private waiting?: (result: IteratorResult<Uint8Array>) => void;
  private ended = false;

  constructor(private onTake: () => void) {}

  public push(chunk: Uint8Array): void {
    if (this.ended) return;

    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = undefined;
      resolve({ value: chunk, done: false });
      return;
    }

    this.chunks.push(chunk);
    this.bytes += chunk.length;
  }

  public end(): void {
    this.ended = true;
    this.waiting?.({ value: undefined, done: true });
    this.waiting = undefined;
  }

  public [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    return {
      next: (): Promise<IteratorResult<Uint8Array>> => {
        const chunk = this.chunks.shift();
        if (chunk) {
          this.bytes -= chunk.length;
          this.onTake();
          return Promise.resolve({ value: chunk, done: false });
        }

        if (this.ended) {
          return Promise.resolve({ value: undefined, done: true });
        }

        return new Promise((resolve) => {
          this.waiting = resolve;
        });
      },
    };
  }
}

interface TerminalSession {
  sessionId: string;
  name?: string;
  persistent: boolean;
  pty: IPty;
  screen: Terminal;
  serializer: SerializeAddon;
  attachments: Set<OutputQueue>;
  dimensions: { cols: number; rows: number };
  closed: boolean;
  paused: boolean;
  mouseEncoding?: number;
  cursorHidden: boolean;
  lastActivity: Date;
}

export class TerminalManager implements TerminalManagerInterface {
  private proxyServer: ProxyServer;
  private logger: LoggerService;

  private sessions = new Map<string, TerminalSession>();
  private namespaces = NamespaceManager.terminalManagerNamespaces();
  private closeProxy?: () => Promise<void>;

  private static readonly BACKPRESSURE_THRESHOLD = 64 * 1024;
  private static readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000;
  private static readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  private static readonly MOUSE_ENCODINGS = new Set([1005, 1006, 1015, 1016]);
  private static readonly SCROLLBACK_LINES = 1000;

  private static readonly ALLOWED_SHELLS =
    process.platform === 'win32'
      ? new Set(['cmd.exe', 'powershell.exe', 'pwsh.exe'])
      : new Set(['/bin/bash', '/bin/sh', '/bin/zsh', '/usr/bin/bash', '/usr/bin/sh', '/usr/bin/zsh', '/usr/bin/fish']);

  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    this.proxyServer = inject('proxy');
    this.logger = inject('logger');
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

    const screen = new xtermHeadless.Terminal({ cols, rows, scrollback: TerminalManager.SCROLLBACK_LINES, allowProposedApi: true });
    const serializer = new SerializeAddon();
    screen.loadAddon(serializer);

    const session: TerminalSession = {
      sessionId,
      name: options?.name,
      persistent: options?.persistent ?? false,
      pty: ptyProcess,
      screen,
      serializer,
      attachments: new Set(),
      dimensions: { cols, rows },
      closed: false,
      paused: false,
      cursorHidden: false,
      lastActivity: new Date(),
    };
    this.trackModes(session);

    ptyProcess.onData((data) => {
      if (session.closed) return;

      screen.write(data);
      const chunk = Buffer.from(data);
      for (const queue of session.attachments) {
        queue.push(chunk);
      }

      if (!session.paused && this.isBacklogged(session)) {
        session.paused = true;
        ptyProcess.pause?.();
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      this.logger.trace(`Terminal session ${sessionId} exited with code ${exitCode}`);
      this.dispose(session);
      this.publishTerminalManagerEvent('sessionClosed', { sessionId });
    });

    this.sessions.set(sessionId, session);

    return this.describe(session);
  }

  @RPCMethod
  public async listSessions(): Promise<TerminalSessionInfo[]> {
    return [...this.sessions.values()].filter((session) => session.persistent).map((session) => this.describe(session));
  }

  @RPCMethod
  public async *generateOutput(sessionId: string): AsyncGenerator<Uint8Array> {
    const session = this.sessions.get(sessionId);
    if (!session || session.closed) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const queue = new OutputQueue(() => this.resumeIfDrained(session));
    session.attachments.add(queue);
    // holds what the shell printed before this client came, taken in the attach's tick so nothing arrives twice or not at all
    const snapshot = this.snapshot(session);

    const signal = sessionSignal();
    const detach = (): void => queue.end();
    signal?.addEventListener('abort', detach, { once: true });

    try {
      const screen = await snapshot;
      if (screen) {
        yield Buffer.from(screen);
      }

      for await (const chunk of queue) {
        yield chunk;
      }
    } finally {
      signal?.removeEventListener('abort', detach);
      this.detach(session, queue);
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
    session.screen.resize(dimensions.cols, dimensions.rows);
    session.dimensions = dimensions;
  }

  @RPCMethod
  public async updateSession(sessionId: string, update: TerminalSessionUpdate): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.closed) return;

    session.name = update.name ?? session.name;
    session.persistent = update.persistent ?? session.persistent;
  }

  @RPCMethod
  public async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.logger.trace(`Closing terminal session ${sessionId}`);
    this.dispose(session);
    session.pty.kill();
  }

  private describe(session: TerminalSession): TerminalSessionInfo {
    return {
      sessionId: session.sessionId,
      pid: session.pty.pid,
      dimensions: session.dimensions,
      name: session.name,
      persistent: session.persistent,
    };
  }

  private snapshot(session: TerminalSession): Promise<string> {
    return new Promise((resolve) => {
      session.screen.write('', () => resolve(session.serializer.serialize() + this.serializeMissingModes(session)));
    });
  }

  private trackModes(session: TerminalSession): void {
    session.screen.parser.registerCsiHandler({ prefix: '?', final: 'h' }, (params) => this.setModes(session, params, true));
    session.screen.parser.registerCsiHandler({ prefix: '?', final: 'l' }, (params) => this.setModes(session, params, false));
    session.screen.parser.registerEscHandler({ final: 'c' }, () => {
      session.mouseEncoding = undefined;
      session.cursorHidden = false;
      return false;
    });
  }

  private setModes(session: TerminalSession, params: (number | number[])[], enabled: boolean): boolean {
    for (const param of params) {
      if (param === 25) {
        session.cursorHidden = !enabled;
      } else if (typeof param === 'number' && TerminalManager.MOUSE_ENCODINGS.has(param)) {
        if (enabled) session.mouseEncoding = param;
        else if (session.mouseEncoding === param) session.mouseEncoding = undefined;
      }
    }
    // xterm still applies the mode itself
    return false;
  }

  private serializeMissingModes(session: TerminalSession): string {
    let modes = '';
    if (session.mouseEncoding) modes += `\x1b[?${session.mouseEncoding}h`;
    if (session.cursorHidden) modes += '\x1b[?25l';
    return modes;
  }

  private detach(session: TerminalSession, queue: OutputQueue): void {
    session.attachments.delete(queue);
    this.resumeIfDrained(session);

    if (!session.persistent && !session.attachments.size) {
      this.closeSession(session.sessionId);
    }
  }

  private isBacklogged(session: TerminalSession): boolean {
    for (const queue of session.attachments) {
      if (queue.bytes >= TerminalManager.BACKPRESSURE_THRESHOLD) return true;
    }
    return false;
  }

  private resumeIfDrained(session: TerminalSession): void {
    if (!session.paused) return;

    for (const queue of session.attachments) {
      if (queue.bytes >= TerminalManager.BACKPRESSURE_THRESHOLD / 2) return;
    }

    session.paused = false;
    session.pty.resume?.();
  }

  private dispose(session: TerminalSession): void {
    if (session.closed) return;

    session.closed = true;
    for (const queue of session.attachments) {
      queue.end();
    }
    session.screen.dispose();
    this.sessions.delete(session.sessionId);
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
      if (session.persistent) continue;

      const inactiveTime = now - session.lastActivity.getTime();

      if (inactiveTime > TerminalManager.SESSION_TIMEOUT_MS) {
        this.logger.trace(`Cleaning up inactive terminal session ${sessionId} (inactive for ${Math.round(inactiveTime / 1000 / 60)} minutes)`);
        this.closeSession(sessionId);
      }
    }
  }
}
