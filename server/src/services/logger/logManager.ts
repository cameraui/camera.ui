import { Logger } from '@camera.ui/common/logger';
import { EventEmitter } from 'node:events';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { FileTransport } from './transports/fileTransport.js';

import type { LogEntry } from '@camera.ui/common/logger';

export interface LogManagerOptions {
  logsPath: string;
  systemLogPath: string;
  logLevel?: 'log' | 'debug' | 'trace';
}

export class LogManager extends EventEmitter {
  private loggers = new Map<string, Logger>();
  private fileTransports = new Map<string, FileTransport>();
  private systemTransport: FileTransport;

  private readonly logsPath: string;
  private debugEnabled = false;
  private traceEnabled = false;

  constructor(private options: LogManagerOptions) {
    super();

    this.logsPath = options.logsPath;

    if (options.logLevel === 'debug') {
      this.debugEnabled = true;
    } else if (options.logLevel === 'trace') {
      this.debugEnabled = true;
      this.traceEnabled = true;
    }

    this.systemTransport = new FileTransport({
      filePath: options.systemLogPath,
      bufferSize: 5,
      flushInterval: 200,
    });

    this.ensureSystemTransport('server', 'Server');
  }

  public createCameraLogger(cameraId: string, cameraName: string): Logger {
    const key = `camera:${cameraId}`;

    let logger = this.loggers.get(key);
    if (logger) {
      logger.prefix = cameraName;
      return logger;
    }

    const filePath = join(this.logsPath, `camera-${cameraId}.log`);
    const transport = new FileTransport({
      filePath,
      bufferSize: 1,
    });
    transport.writeHeader(cameraName);
    this.fileTransports.set(key, transport);

    logger = new Logger({
      prefix: cameraName,
      targetId: cameraId,
      targetType: 'camera',
      debugEnabled: this.debugEnabled,
      traceEnabled: this.traceEnabled,
    });

    logger.onLog((entry) => this.route(entry));

    this.loggers.set(key, logger);
    return logger;
  }

  public createPluginLogger(pluginId: string, pluginName: string, version?: string): Logger {
    const key = `plugin:${pluginId}`;

    let logger = this.loggers.get(key);
    if (logger) {
      return logger;
    }

    const filePath = join(this.logsPath, `plugin-${pluginId}.log`);
    const transport = new FileTransport({
      filePath,
      bufferSize: 1,
    });
    const headerTitle = version ? `${pluginName}@${version}` : pluginName;
    transport.writeHeader(headerTitle);
    this.fileTransports.set(key, transport);

    logger = new Logger({
      prefix: pluginName,
      targetId: pluginId,
      targetType: 'plugin',
      debugEnabled: this.debugEnabled,
      traceEnabled: this.traceEnabled,
    });

    logger.onLog((entry) => this.route(entry));

    this.loggers.set(key, logger);
    return logger;
  }

  public createSystemLogger(prefix: string, sourceId?: string, suffix?: string): Logger {
    const key = `system:${sourceId ?? prefix}:${suffix ?? ''}`;

    let logger = this.loggers.get(key);
    if (logger) {
      return logger;
    }

    if (sourceId) {
      this.ensureSystemTransport(sourceId, prefix);
    }

    logger = new Logger({
      prefix,
      suffix,
      targetId: sourceId,
      targetType: 'system',
      debugEnabled: this.debugEnabled,
      traceEnabled: this.traceEnabled,
    });

    logger.onLog((entry) => this.route(entry));

    this.loggers.set(key, logger);
    return logger;
  }

  private ensureSystemTransport(sourceId: string, title?: string): void {
    const key = `system:${sourceId}`;
    if (this.fileTransports.has(key)) {
      return;
    }

    const transport = new FileTransport({
      filePath: join(this.logsPath, `system-${sourceId}.log`),
      bufferSize: 1,
    });
    if (title) {
      transport.writeHeader(title);
    }
    this.fileTransports.set(key, transport);
  }

  public handleChildLog(entry: LogEntry): void {
    entry.source = 'child';

    this.route(entry);

    // Mirror to console so child output is visible
    const logger = new Logger();
    console.log(...logger.formatForConsole(entry));
  }

  public createRawEntry(message: string, targetId?: string, targetType?: 'camera' | 'plugin'): LogEntry {
    return {
      timestamp: Date.now(),
      level: 'raw',
      prefix: '',
      message,
      targetId,
      targetType,
      source: 'child',
      processId: process.pid,
    };
  }

  public getCameraLogPath(cameraId: string): string {
    return join(this.logsPath, `camera-${cameraId}.log`);
  }

  public getPluginLogPath(pluginId: string): string {
    return join(this.logsPath, `plugin-${pluginId}.log`);
  }

  public getSystemLogPath(sourceId: string): string {
    return join(this.logsPath, `system-${sourceId}.log`);
  }

  public removeCameraLogger(cameraId: string): void {
    const key = `camera:${cameraId}`;
    this.removeLogger(key);
  }

  public removePluginLogger(pluginId: string): void {
    const key = `plugin:${pluginId}`;
    this.removeLogger(key);
  }

  public setLogLevel(level: 'log' | 'debug' | 'trace'): void {
    this.debugEnabled = level === 'debug' || level === 'trace';
    this.traceEnabled = level === 'trace';

    for (const logger of this.loggers.values()) {
      logger.debugEnabled = this.debugEnabled;
      logger.traceEnabled = this.traceEnabled;
    }

    // Emit so child processes can update their levels
    this.emit('logLevelChanged', level);
  }

  public getLogLevel(): { debugEnabled: boolean; traceEnabled: boolean } {
    return {
      debugEnabled: this.debugEnabled,
      traceEnabled: this.traceEnabled,
    };
  }

  public async close(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    for (const transport of this.fileTransports.values()) {
      closePromises.push(transport.close());
    }
    closePromises.push(this.systemTransport.close());

    await Promise.all(closePromises);

    this.loggers.clear();
    this.fileTransports.clear();
  }

  private route(entry: LogEntry): void {
    this.systemTransport.write(entry);

    if (entry.targetId && entry.targetType) {
      const key = `${entry.targetType}:${entry.targetId}`;
      const transport = this.fileTransports.get(key);
      if (transport) {
        transport.write(entry);
      }
    }

    // Mirror camera-from-plugin logs into the plugin transport too, but skip if the plugin already handled it above
    if (entry.pluginId && !(entry.targetType === 'plugin' && entry.targetId === entry.pluginId)) {
      const pluginKey = `plugin:${entry.pluginId}`;
      const pluginTransport = this.fileTransports.get(pluginKey);
      if (pluginTransport) {
        pluginTransport.write(entry);
      }
    }

    this.emit('log', entry);
  }

  private async removeLogger(key: string): Promise<void> {
    const logger = this.loggers.get(key);
    if (logger) {
      logger.removeAllListeners();
      this.loggers.delete(key);
    }

    const transport = this.fileTransports.get(key);
    if (transport) {
      const filePath = transport.getFilePath();
      await transport.close();
      this.fileTransports.delete(key);

      try {
        rmSync(filePath);
      } catch {
        // ignore removal errors
      }
    }
  }
}
