import { Logger } from '@camera.ui/common/logger';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { inject, tryInject } from '../../../container.js';
import { readLogAround, readLogChunk, readLogTail, stampTime } from '../../../services/logger/logReader.js';
import { paint } from '../../../utils/colors.js';
import { setTerminalCols } from '../../utils/install-logger.js';

import type { LogEntry } from '@camera.ui/common/logger';
import type { Namespace, Server, Socket } from 'socket.io';
import type { CameraUiAPI } from '../../../api.js';
import type { Database } from '../../database/index.js';
import type { CameraUi } from '../../../master.js';
import type { PluginManager } from '../../../plugins/index.js';
import type { ConfigService } from '../../../services/config/index.js';
import type { LogChunk } from '../../../services/logger/logReader.js';
import type { SocketNsp } from '../types.js';

const MAIN_TARGET = 'main';
const REPLAY_BYTES = 50_000;

interface LogQuery {
  source?: string;
  before?: number;
  after?: number;
  around?: number;
  aroundStamp?: string;
}

interface LogSourceFile {
  path: string;
  target: string;
  filter?: string | number;
}

type LogChunkReply = (LogChunk & { generation: number }) | { error: 'not_found' | 'failed' };

interface LogSubscriber {
  socket: Socket;
  channel: string;
  filter?: string | number;
}

const ANSI_SGR = '\\u001B\\[[0-9;]*m';

export class LogsNamespace {
  public nsp: Namespace;
  public nspName: SocketNsp = '/logs';

  private static readonly SYSTEM_SOURCES = new Set(['server', 'go2rtc', 'nats', 'tunnel']);
  private static readonly STARTUP_POLL_MS = 250;

  private subscribers = new Map<string, Map<string, LogSubscriber>>();
  private unsubscribes = new WeakMap<Socket, Map<string, number>>();
  private logListener?: (entry: LogEntry) => void;

  private api: CameraUiAPI;
  private cameraui: CameraUi;
  private configService: ConfigService;
  private dbs: Database;
  private pluginManager: PluginManager;

  constructor(io: Server) {
    this.api = inject('api');
    this.cameraui = inject('cameraui');
    this.configService = inject('configService');
    this.dbs = inject('dbs');
    this.pluginManager = inject('pluginManager');

    this.nsp = io.of(this.nspName);
    this.nsp.on('connection', (socket: Socket) => {
      socket.on('get-all-logs', () => this.getAllLogs(socket));
      socket.on('get-system-log', (sourceId: string, options?: { sinceLastStart?: boolean }) => this.getSystemLog(socket, sourceId, options));
      socket.on('get-camera-log', (cameraName: string, options?: { sinceLastStart?: boolean }) => this.getCameraLog(socket, cameraName, options));
      socket.on('get-plugin-log', (pluginName: string, options?: { sinceLastStart?: boolean }) => this.getPluginLog(socket, pluginName, options));
      socket.on('log:open', (query: LogQuery, ack?: (reply: LogChunkReply) => void) => this.openLog(socket, query, ack));
      socket.on('log:chunk', (query: LogQuery, ack?: (reply: LogChunkReply) => void) => this.readChunk(query, ack));
      socket.on('term-size', (payload: { target?: string; cols?: number }) => {
        if (payload?.target && typeof payload.cols === 'number') {
          setTerminalCols(payload.target, payload.cols);
        }
      });
      socket.on('logs:unsubscribe', (payload?: { channel?: unknown }) => {
        if (typeof payload?.channel === 'string') this.unsubscribe(socket, payload.channel);
      });
      socket.on('disconnect', () => this.unsubscribe(socket));
    });
  }

  public getAllLogs(socket: Socket) {
    const emitTo = 'stdout';
    this.streamLog(socket, this.configService.LOG_FILE, emitTo, MAIN_TARGET);
  }

  public getSystemLog(socket: Socket, sourceId: string, options?: { sinceLastStart?: boolean }) {
    const emitTo = `stdout/system/${sourceId}`;

    if (!LogsNamespace.SYSTEM_SOURCES.has(sourceId)) {
      socket.emit(emitTo, paint('red', `Unknown log source "${sourceId}".\r\n`));
      return;
    }

    const logFile = join(this.configService.LOGS_PATH, `system-${sourceId}.log`);
    this.streamLog(socket, logFile, emitTo, `system:${sourceId}`, undefined, options);
  }

  public async getCameraLog(socket: Socket, cameraName: string, options?: { sinceLastStart?: boolean }) {
    const emitTo = `stdout/${cameraName}`;
    const unsubscribes = this.unsubscribeCount(socket, emitTo);
    const cameraController = await this.lookupAfterStartup(socket, emitTo, () => this.api.getCamera(cameraName));

    if (!cameraController) {
      socket.emit(emitTo, paint('red', `Camera "${cameraName}" not found.\r\n`));
      return;
    }

    this.streamLog(socket, cameraController.logPath, emitTo, `camera:${cameraController.id}`, cameraController.camera.name, options, unsubscribes);
  }

  public async getPluginLog(socket: Socket, pluginName: string, options?: { sinceLastStart?: boolean }) {
    const emitTo = `stdout/${pluginName}`;
    const unsubscribes = this.unsubscribeCount(socket, emitTo);
    const plugin = await this.lookupAfterStartup(socket, emitTo, () => this.pluginManager.plugins.get(pluginName));

    if (!plugin) {
      socket.emit(emitTo, paint('red', `Plugin "${pluginName}" not found.\r\n`));
      return;
    }

    this.streamLog(socket, plugin.logPath, emitTo, `plugin:${plugin.id}`, plugin.displayName, options, unsubscribes);
  }

  private async openLog(socket: Socket, query: LogQuery, ack?: (reply: LogChunkReply) => void) {
    if (typeof ack !== 'function') return;

    const source = this.resolveSource(query?.source);
    if (!source) {
      ack({ error: 'not_found' });
      return;
    }

    // subscribed before the read, the client drops the lines it gets twice
    this.subscribe(socket, source.target, `log:${query.source}`, source.filter);
    ack(await this.chunkReply(source, query));
  }

  private async readChunk(query: LogQuery, ack?: (reply: LogChunkReply) => void) {
    if (typeof ack !== 'function') return;

    const source = this.resolveSource(query?.source);
    ack(source ? await this.chunkReply(source, query) : { error: 'not_found' });
  }

  private resolveSource(source?: string): LogSourceFile | undefined {
    if (source === 'all') {
      return { path: this.configService.LOG_FILE, target: MAIN_TARGET };
    }

    const separator = source?.indexOf(':') ?? -1;
    if (!source || separator === -1) return undefined;

    const kind = source.slice(0, separator);
    const id = source.slice(separator + 1);
    const logsPath = this.configService.LOGS_PATH;

    if (kind === 'system' && LogsNamespace.SYSTEM_SOURCES.has(id)) {
      return { path: join(logsPath, `system-${id}.log`), target: source };
    }
    if (kind === 'camera') {
      const camera = this.dbs.camerasDB.get(id);
      return camera && { path: join(logsPath, `camera-${id}.log`), target: source, filter: camera.name };
    }
    if (kind === 'plugin' && this.dbs.pluginsDB.get(id)) {
      const plugin = Array.from(this.pluginManager.plugins.values()).find((entry) => entry.id === id);
      return { path: join(logsPath, `plugin-${id}.log`), target: source, filter: plugin?.displayName };
    }
    return undefined;
  }

  private async chunkReply(source: LogSourceFile, query: LogQuery): Promise<LogChunkReply> {
    const logManager = tryInject('logManager');
    const generationOf = () => logManager?.generationOf(source.path) ?? 0;
    const around = typeof query.aroundStamp === 'string' ? stampTime(query.aroundStamp) : query.around;
    await logManager?.syncLog(source.path);

    // a rotation during the read shifts every offset, read again
    for (let attempt = 0; attempt < 2; attempt++) {
      const generation = generationOf();
      const read = typeof around === 'number' ? readLogAround(source.path, around) : readLogChunk(source.path, { before: query.before, after: query.after });
      const chunk = await read.catch(() => undefined);
      if (!chunk) break;
      if (generationOf() !== generation) continue;

      const filter = source.filter;
      return { ...chunk, lines: filter === undefined ? chunk.lines : chunk.lines.map((line) => this.filterLine(line, filter)), generation };
    }
    return { error: 'failed' };
  }

  private async lookupAfterStartup<T>(socket: Socket, channel: string, lookup: () => T | undefined): Promise<T | undefined> {
    const ready = () => this.cameraui.status === 'ready';
    let found = lookup();
    if (found || ready()) return found;

    socket.emit(channel, paint('gray', 'Waiting for camera.ui to finish starting...\r\n'));
    while (!found && !ready() && !socket.disconnected) {
      await new Promise((resolve) => setTimeout(resolve, LogsNamespace.STARTUP_POLL_MS));
      found = lookup();
    }
    return found;
  }

  private async streamLog(
    socket: Socket,
    logFile: string,
    channel: string,
    target: string,
    filter?: string | number,
    options?: { sinceLastStart?: boolean },
    unsubscribes = this.unsubscribeCount(socket, channel),
  ) {
    if (!existsSync(logFile)) {
      socket.emit(channel, paint('red', `\r\nNo log file exists at path: ${logFile}\r\n`));
      return;
    }

    try {
      const content = await readLogTail(logFile, REPLAY_BYTES);
      if (socket.disconnected || this.unsubscribeCount(socket, channel) !== unsubscribes) {
        return;
      }
      const lastStartPosition = options?.sinceLastStart ? this.findLastStartPosition(content) : -1;
      const replay = lastStartPosition === -1 ? this.replayLines(content, false, filter) : this.replayLines(content.substring(lastStartPosition), true, filter);

      if (replay) {
        socket.emit(channel, replay);
      }

      this.subscribe(socket, target, channel, filter);
    } catch (error: any) {
      socket.emit(channel, paint('red', `Failed to read log file: ${error.message}\r\n`));
    }
  }

  private findLastStartPosition(content: string): number {
    const startMarkerPattern = /-{3,}\r?\n[\d/]+, [\d:]+ [AP]M:/;
    const matches = [...content.matchAll(new RegExp(startMarkerPattern, 'g'))];

    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      return lastMatch.index || -1;
    }

    return -1;
  }

  private replayLines(content: string, sinceStart: boolean, filter?: string | number): string {
    let lines = content.split(/\r?\n/);
    if (sinceStart) {
      lines = lines.filter((line) => line.trim());
    }
    if (filter !== undefined) {
      lines = lines.map((line) => this.filterLine(line, filter));
    }
    return sinceStart ? lines.map((line) => `${line}\r\n`).join('') : lines.join('\r\n');
  }

  private subscribe(socket: Socket, target: string, channel: string, filter?: string | number) {
    let subscribers = this.subscribers.get(target);
    if (!subscribers) {
      subscribers = new Map();
      this.subscribers.set(target, subscribers);
    }

    subscribers.set(socket.id, { socket, channel, filter });
    this.listen(socket, channel);
  }

  private unsubscribe(socket: Socket, channel?: string) {
    if (channel !== undefined) {
      const counts = this.unsubscribes.get(socket) ?? new Map<string, number>();
      counts.set(channel, (counts.get(channel) ?? 0) + 1);
      this.unsubscribes.set(socket, counts);
    }

    for (const [target, subscribers] of this.subscribers) {
      if (channel !== undefined && subscribers.get(socket.id)?.channel !== channel) {
        continue;
      }
      subscribers.delete(socket.id);
      if (subscribers.size === 0) {
        this.subscribers.delete(target);
      }
    }
  }

  private unsubscribeCount(socket: Socket, channel: string): number {
    return this.unsubscribes.get(socket)?.get(channel) ?? 0;
  }

  private listen(socket: Socket, channel: string) {
    if (this.logListener) {
      return;
    }

    const logManager = tryInject('logManager');
    if (!logManager) {
      socket.emit(channel, paint('red', 'Live log output is not available yet.\r\n'));
      return;
    }

    this.logListener = (entry: LogEntry) => this.dispatch(entry);
    logManager.on('log', this.logListener);
  }

  private dispatch(entry: LogEntry) {
    if (this.subscribers.size === 0) {
      return;
    }

    const targets = LogsNamespace.targetsFor(entry).filter((target) => this.subscribers.get(target)?.size);
    if (targets.length === 0) {
      return;
    }

    const line = Logger.formatWithColors(entry).split(/\r?\n/).join('\r\n');

    for (const target of targets) {
      for (const subscriber of this.subscribers.get(target)!.values()) {
        const processed = subscriber.filter === undefined ? line : this.filterLine(line, subscriber.filter);
        subscriber.socket.emit(subscriber.channel, processed + '\r\n');
      }
    }
  }

  private filterLine(line: string, filter: string | number): string {
    if (typeof filter === 'string') {
      return this.removeName(line, filter);
    } else {
      return this.removeBracketedContent(line, filter);
    }
  }

  private removeName(str: string, cameraName: string) {
    const escapeRegex = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedCameraName = escapeRegex(cameraName);
    // single-space replacement avoids consecutive spaces
    const regex = new RegExp(`\\s*(${ANSI_SGR})?\\[${escapedCameraName}\\](${ANSI_SGR})?\\s*`, 'g');

    return str.replace(regex, ' ');
  }

  private removeBracketedContent(str: string, n: number) {
    let count = 0;
    const regex = new RegExp(`\\s*(${ANSI_SGR})?\\[[^\\]]+\\](${ANSI_SGR})?\\s*`, 'g');

    return str.replace(regex, (match) => {
      count++;
      return count === n ? ' ' : match;
    });
  }

  private static targetsFor(entry: LogEntry): string[] {
    const targets = [MAIN_TARGET];

    if (entry.targetId && entry.targetType) {
      targets.push(`${entry.targetType}:${entry.targetId}`);
    }
    if (entry.pluginId && !(entry.targetType === 'plugin' && entry.targetId === entry.pluginId)) {
      targets.push(`plugin:${entry.pluginId}`);
    }

    return targets;
  }
}
