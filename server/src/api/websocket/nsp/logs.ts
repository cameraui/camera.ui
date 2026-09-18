import { Logger } from '@camera.ui/common/logger';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { container } from 'tsyringe';

import { paint } from '../../../utils/colors.js';
import { setTerminalCols } from '../../utils/install-logger.js';

import type { LogEntry } from '@camera.ui/common/logger';
import type { ReadStream } from 'node:fs';
import type { Namespace, Server, Socket } from 'socket.io';
import type { CameraUiAPI } from '../../../api.js';
import type { CameraUi } from '../../../main.js';
import type { PluginManager } from '../../../plugins/index.js';
import type { ConfigService } from '../../../services/config/index.js';
import type { LogManager } from '../../../services/logger/logManager.js';
import type { SocketNsp } from '../types.js';

const MAIN_TARGET = 'main';

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
  private logListener?: (entry: LogEntry) => void;

  private api: CameraUiAPI;
  private cameraui: CameraUi;
  private configService: ConfigService;
  private pluginManager: PluginManager;

  constructor(io: Server) {
    this.api = container.resolve<CameraUiAPI>('api');
    this.cameraui = container.resolve<CameraUi>('cameraui');
    this.configService = container.resolve<ConfigService>('configService');
    this.pluginManager = container.resolve<PluginManager>('pluginManager');

    this.nsp = io.of(this.nspName);
    this.nsp.on('connection', (socket: Socket) => {
      socket.on('get-all-logs', () => this.getAllLogs(socket));
      socket.on('get-system-log', (sourceId: string, options?: { sinceLastStart?: boolean }) => this.getSystemLog(socket, sourceId, options));
      socket.on('get-camera-log', (cameraName: string, options?: { sinceLastStart?: boolean }) => this.getCameraLog(socket, cameraName, options));
      socket.on('get-plugin-log', (pluginName: string, options?: { sinceLastStart?: boolean }) => this.getPluginLog(socket, pluginName, options));
      socket.on('term-size', (payload: { target?: string; cols?: number }) => {
        if (payload?.target && typeof payload.cols === 'number') {
          setTerminalCols(payload.target, payload.cols);
        }
      });
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
    const cameraController = await this.lookupAfterStartup(socket, emitTo, () => this.api.getCamera(cameraName));

    if (!cameraController) {
      socket.emit(emitTo, paint('red', `Camera "${cameraName}" not found.\r\n`));
      return;
    }

    this.streamLog(socket, cameraController.logPath, emitTo, `camera:${cameraController.id}`, cameraController.camera.name, options);
  }

  public async getPluginLog(socket: Socket, pluginName: string, options?: { sinceLastStart?: boolean }) {
    const emitTo = `stdout/${pluginName}`;
    const plugin = await this.lookupAfterStartup(socket, emitTo, () => this.pluginManager.plugins.get(pluginName));

    if (!plugin) {
      socket.emit(emitTo, paint('red', `Plugin "${pluginName}" not found.\r\n`));
      return;
    }

    this.streamLog(socket, plugin.logPath, emitTo, `plugin:${plugin.id}`, plugin.displayName, options);
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

  private async streamLog(socket: Socket, logFile: string, channel: string, target: string, filter?: string | number, options?: { sinceLastStart?: boolean }) {
    if (!existsSync(logFile)) {
      socket.emit(channel, paint('red', `\r\nNo log file exists at path: ${logFile}\r\n`));
      return;
    }

    try {
      const logStats = await stat(logFile);
      const fileContent = await this.readFileContent(logFile, logStats.size);

      if (options?.sinceLastStart) {
        const lastStartPosition = this.findLastStartPosition(fileContent);
        if (lastStartPosition !== -1) {
          const recentContent = fileContent.substring(lastStartPosition);
          this.emitContent(socket, channel, recentContent, filter);
        } else {
          const logStartPosition = logStats.size <= 50000 ? 0 : logStats.size - 50000;
          const logStream = createReadStream(logFile, { start: logStartPosition });
          this.handleLogStream(socket, channel, logStream, filter);
        }
      } else {
        const logStartPosition = logStats.size <= 50000 ? 0 : logStats.size - 50000;
        const logStream = createReadStream(logFile, { start: logStartPosition });
        this.handleLogStream(socket, channel, logStream, filter);
      }

      this.subscribe(socket, target, channel, filter);
    } catch (error: any) {
      socket.emit(channel, paint('red', `Failed to read log file: ${error.message}\r\n`));
    }
  }

  private async readFileContent(logFile: string, size: number): Promise<string> {
    const startPosition = size <= 50000 ? 0 : size - 50000;
    const fd = createReadStream(logFile, { start: startPosition });

    return new Promise((resolve, reject) => {
      let content = '';
      fd.on('data', (chunk) => {
        content += chunk.toString();
      });
      fd.on('end', () => resolve(content));
      fd.on('error', reject);
    });
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

  private emitContent(socket: Socket, to: string, content: string, filter?: string | number) {
    const lines = content.split(/\r?\n/);
    lines.forEach((line) => {
      if (line.trim()) {
        let processedLine = line;
        if (filter !== undefined) {
          processedLine = this.filterLine(processedLine, filter);
        }
        socket.emit(to, processedLine + '\r\n');
      }
    });
  }

  private handleLogStream(socket: Socket, to: string, logStream: ReadStream, filter?: string | number) {
    logStream.on('data', (buffer) => {
      let line = buffer.toString().split(/\r?\n/).join('\r\n');
      if (filter !== undefined) {
        line = this.filterLine(line, filter);
      }
      socket.emit(to, line);
    });

    logStream.on('end', () => {
      logStream.close();
    });

    logStream.on('error', (error) => {
      socket.emit(to, paint('red', `Error reading log file: ${error.message}\r\n`));
      logStream.close();
    });
  }

  private subscribe(socket: Socket, target: string, channel: string, filter?: string | number) {
    let subscribers = this.subscribers.get(target);
    if (!subscribers) {
      subscribers = new Map();
      this.subscribers.set(target, subscribers);
    }

    const alreadySubscribed = subscribers.has(socket.id);
    subscribers.set(socket.id, { socket, channel, filter });

    if (!this.listen(socket, channel)) {
      return;
    }
    if (alreadySubscribed) {
      return;
    }

    const cleanup = () => {
      const current = this.subscribers.get(target);
      if (current) {
        current.delete(socket.id);
        if (current.size === 0) {
          this.subscribers.delete(target);
        }
      }

      socket.removeListener('end', cleanup);
      socket.removeListener('disconnect', cleanup);
    };

    socket.on('end', cleanup);
    socket.on('disconnect', cleanup);
  }

  private listen(socket: Socket, channel: string): boolean {
    if (this.logListener) {
      return true;
    }

    let logManager: LogManager;
    try {
      logManager = container.resolve<LogManager>('logManager');
    } catch {
      socket.emit(channel, paint('red', 'Live log output is not available yet.\r\n'));
      return false;
    }

    this.logListener = (entry: LogEntry) => this.dispatch(entry);
    logManager.on('log', this.logListener);

    return true;
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
