import ansiRegex from 'ansi-regex';
import { red } from 'ansicolor';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Tail } from 'tail';
import { container } from 'tsyringe';

import { setTerminalCols } from '../../utils/install-logger.js';

import type { EventEmitter } from 'node:events';
import type { ReadStream } from 'node:fs';
import type { Namespace, Server, Socket } from 'socket.io';
import type { CameraUiAPI } from '../../../api.js';
import type { PluginManager } from '../../../plugins/index.js';
import type { ConfigService } from '../../../services/config/index.js';
import type { SocketNsp } from '../types.js';

interface TailSubscriber {
  socket: Socket;
  channel: string;
  filter?: string | number;
}

interface SharedTail {
  tail: Tail & EventEmitter;
  subscribers: Map<string, TailSubscriber>; // socketId -> subscriber
}

export class LogsNamespace {
  public nsp: Namespace;
  public nspName: SocketNsp = '/logs';

  private static readonly SYSTEM_SOURCES = new Set(['server', 'go2rtc', 'nats', 'tunnel']);

  private sharedTails = new Map<string, SharedTail>();

  private api: CameraUiAPI;
  private configService: ConfigService;
  private pluginManager: PluginManager;

  constructor(io: Server) {
    this.api = container.resolve<CameraUiAPI>('api');
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
    this.tailLogFromFileNative(socket, this.configService.LOG_FILE, emitTo);
  }

  public getSystemLog(socket: Socket, sourceId: string, options?: { sinceLastStart?: boolean }) {
    const emitTo = `stdout/system/${sourceId}`;

    if (!LogsNamespace.SYSTEM_SOURCES.has(sourceId)) {
      socket.emit(emitTo, red(`Unknown log source "${sourceId}".\r\n`));
      return;
    }

    const logFile = join(this.configService.LOGS_PATH, `system-${sourceId}.log`);
    this.tailLogFromFileNative(socket, logFile, emitTo, undefined, options);
  }

  public getCameraLog(socket: Socket, cameraName: string, options?: { sinceLastStart?: boolean }) {
    const emitTo = `stdout/${cameraName}`;
    const cameraController = this.api.getCamera(cameraName);

    if (!cameraController) {
      socket.emit(emitTo, red(`Camera "${cameraName}" not found.\r\n`));
      return;
    }

    this.tailLogFromFileNative(socket, cameraController.logPath, emitTo, cameraController.camera.name, options);
  }

  public getPluginLog(socket: Socket, pluginName: string, options?: { sinceLastStart?: boolean }) {
    const emitTo = `stdout/${pluginName}`;
    const plugin = this.pluginManager.plugins.get(pluginName);

    if (!plugin) {
      socket.emit(emitTo, red(`Plugin "${pluginName}" not found.\r\n`));
      return;
    }

    this.tailLogFromFileNative(socket, plugin.logPath, emitTo, plugin.displayName, options);
  }

  private async tailLogFromFileNative(socket: Socket, logFile: string, channel: string, filter?: string | number, options?: { sinceLastStart?: boolean }) {
    if (!existsSync(logFile)) {
      socket.emit(channel, red(`\r\nNo log file exists at path: ${logFile}\r\n`));
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

      this.setupTail(socket, logFile, channel, filter);
    } catch (error: any) {
      socket.emit(channel, red(`Failed to read log file: ${error.message}\r\n`));
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
      socket.emit(to, red(`Error reading log file: ${error.message}\r\n`));
      logStream.close();
    });
  }

  private setupTail(socket: Socket, logFile: string, channel: string, filter?: string | number) {
    const subscriber: TailSubscriber = { socket, channel, filter };

    let shared = this.sharedTails.get(logFile);

    // socket already subscribed to this file - just refresh subscriber info
    if (shared?.subscribers.has(socket.id)) {
      shared.subscribers.set(socket.id, subscriber);
      return;
    }

    if (!shared) {
      const tail = new Tail(logFile, {
        fromBeginning: false,
        useWatchFile: true,
        fsWatchOptions: {
          interval: 200,
        },
      }) as Tail & EventEmitter;

      shared = {
        tail,
        subscribers: new Map(),
      };

      tail.on('line', (line: string) => {
        const baseLine = line.toString().split(/\r?\n/).join('\r\n');
        for (const sub of shared!.subscribers.values()) {
          let processedLine = baseLine;
          if (sub.filter !== undefined) {
            processedLine = this.filterLine(processedLine, sub.filter);
          }
          sub.socket.emit(sub.channel, processedLine + '\r\n');
        }
      });

      tail.on('error', (error: Error | string) => {
        const baseError = error.toString().split(/\r?\n/).join('\r\n');
        for (const sub of shared!.subscribers.values()) {
          let errorLine = baseError;
          if (sub.filter !== undefined) {
            errorLine = this.filterLine(errorLine, sub.filter);
          }
          sub.socket.emit(sub.channel, red(errorLine + '\r\n'));
        }
      });

      this.sharedTails.set(logFile, shared);
    }

    shared.subscribers.set(socket.id, subscriber);

    const cleanup = () => {
      const sharedTail = this.sharedTails.get(logFile);
      if (sharedTail) {
        sharedTail.subscribers.delete(socket.id);

        if (sharedTail.subscribers.size === 0) {
          sharedTail.tail.unwatch();
          this.sharedTails.delete(logFile);
        }
      }

      socket.removeListener('end', cleanup);
      socket.removeListener('disconnect', cleanup);
    };

    socket.on('end', cleanup);
    socket.on('disconnect', cleanup);
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
    const regex = new RegExp(`\\s*(${ansiRegex().source})?\\[${escapedCameraName}\\](${ansiRegex().source})?\\s*`, 'g');

    return str.replace(regex, ' ');
  }

  private removeBracketedContent(str: string, n: number) {
    let count = 0;
    const regex = new RegExp(`\\s*(${ansiRegex().source})?\\[[^\\]]+\\](${ansiRegex().source})?\\s*`, 'g');

    return str.replace(regex, (match) => {
      count++;
      return count === n ? ' ' : match;
    });
  }
}
