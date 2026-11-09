import { Logger } from '@camera.ui/common/logger';
import { MAIN_LOG_SIZE } from '@camera.ui/common/node';
import { EventEmitter } from 'node:events';
import { rm, truncate } from 'node:fs/promises';
import { join } from 'node:path';

import { sweepLogs } from './logSweep.js';
import { FileTransport } from './transports/fileTransport.js';

import type { LogEntry, LogTargetType } from '@camera.ui/common/logger';
import type { KnownLogIds } from './logSweep.js';

const SOURCE_LOG_SIZE = 2 * 1024 * 1024;
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const WORKER_LOG_IDLE_MS = 30 * 24 * 60 * 60 * 1000;

export interface LogManagerOptions {
  logsPath: string;
  systemLogPath: string;
  logLevel?: 'log' | 'debug' | 'trace';
  rotateMainLog?: boolean;
}

export class LogManager extends EventEmitter {
  private loggers = new Map<string, Logger>();
  private transports = new Map<string, FileTransport>();
  private systemTransport: FileTransport;
  private sweepTimer?: NodeJS.Timeout;
  private warnLogger?: Logger;
  private closed = false;

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

    this.systemTransport = this.openTransport(options.systemLogPath, { bufferSize: 5, flushInterval: 200, rotate: options.rotateMainLog ?? true });

    this.ensureSystemTransport('server', 'Server');
  }

  public createCameraLogger(cameraId: string, cameraName: string): Logger {
    const key = `camera:${cameraId}`;

    let logger = this.loggers.get(key);
    if (logger) {
      logger.prefix = cameraName;
      return logger;
    }

    this.openTransport(this.getCameraLogPath(cameraId)).writeHeader(cameraName);

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

    this.openTransport(this.getPluginLogPath(pluginId)).writeHeader(version ? `${pluginName}@${version}` : pluginName);

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

  public handleChildLog(entry: LogEntry): void {
    entry.source = 'child';

    this.route(entry);

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

  public async syncLog(path: string): Promise<void> {
    await this.transports.get(path)?.sync();
  }

  public generationOf(path: string): number {
    return this.transports.get(path)?.generation ?? 0;
  }

  public async clearLog(path: string): Promise<void> {
    const transport = this.transports.get(path);
    if (transport) {
      await transport.clear();
      return;
    }

    await rm(`${path}.1`, { force: true });
    await truncate(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }

  public removeCameraLogger(cameraId: string): Promise<void> {
    return this.removeLogger(`camera:${cameraId}`, this.getCameraLogPath(cameraId));
  }

  public removePluginLogger(pluginId: string): Promise<void> {
    return this.removeLogger(`plugin:${pluginId}`, this.getPluginLogPath(pluginId));
  }

  public setLogLevel(level: 'log' | 'debug' | 'trace'): void {
    this.debugEnabled = level === 'debug' || level === 'trace';
    this.traceEnabled = level === 'trace';

    for (const logger of this.loggers.values()) {
      logger.debugEnabled = this.debugEnabled;
      logger.traceEnabled = this.traceEnabled;
    }

    this.emit('logLevelChanged', level);
  }

  public getLogLevel(): { debugEnabled: boolean; traceEnabled: boolean } {
    return {
      debugEnabled: this.debugEnabled,
      traceEnabled: this.traceEnabled,
    };
  }

  public startSweep(knownIds?: () => KnownLogIds): void {
    if (this.sweepTimer || this.closed) return;

    // a worker knows no ids and goes by file age

    const run = () => {
      this.sweep(knownIds?.()).catch((error) => this.warn(`Log cleanup failed: ${error.message}`));
    };
    this.sweepTimer = setInterval(run, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
    run();
  }

  public async close(): Promise<void> {
    this.closed = true;
    clearInterval(this.sweepTimer);
    this.sweepTimer = undefined;

    await Promise.all(Array.from(this.transports.values(), (transport) => transport.close()));

    this.loggers.clear();
    this.transports.clear();
  }

  private ensureSystemTransport(sourceId: string, title?: string): void {
    const path = this.getSystemLogPath(sourceId);
    if (this.transports.has(path)) {
      return;
    }

    const transport = this.openTransport(path);
    if (title) {
      transport.writeHeader(title);
    }
  }

  private openTransport(path: string, options: { bufferSize?: number; flushInterval?: number; rotate?: boolean } = {}): FileTransport {
    let transport = this.transports.get(path);
    if (!transport) {
      transport = new FileTransport({
        filePath: path,
        maxSize: this.sizeOf(path),
        bufferSize: options.bufferSize ?? 1,
        flushInterval: options.flushInterval,
        rotate: options.rotate,
        onWarning: (message) => this.warn(message),
      });
      this.transports.set(path, transport);
    }
    return transport;
  }

  private sizeOf(path: string): number {
    return path === this.options.systemLogPath ? MAIN_LOG_SIZE : SOURCE_LOG_SIZE;
  }

  private transportFor(targetType: LogTargetType, targetId: string): FileTransport | undefined {
    if (targetType === 'camera') return this.transports.get(this.getCameraLogPath(targetId));
    if (targetType === 'plugin') return this.transports.get(this.getPluginLogPath(targetId));
    return this.transports.get(this.getSystemLogPath(targetId));
  }

  private route(entry: LogEntry): void {
    this.systemTransport.write(entry);

    if (entry.targetId && entry.targetType) {
      this.transportFor(entry.targetType, entry.targetId)?.write(entry);
    }

    // camera logs from a plugin also go to the plugin's log, unless routed there above
    if (entry.pluginId && !(entry.targetType === 'plugin' && entry.targetId === entry.pluginId)) {
      this.transportFor('plugin', entry.pluginId)?.write(entry);
    }

    this.emit('log', entry);
  }

  private async removeLogger(key: string, path: string): Promise<void> {
    const logger = this.loggers.get(key);
    if (logger) {
      logger.removeAllListeners();
      this.loggers.delete(key);
    }

    await this.transports.get(path)?.close();
    this.transports.delete(path);

    await Promise.all([rm(path, { force: true }), rm(`${path}.1`, { force: true })]).catch(() => {});
  }

  private sweep(known?: KnownLogIds): Promise<void> {
    return sweepLogs({
      logsPath: this.logsPath,
      mainLogPath: this.options.systemLogPath,
      known,
      maxIdleMs: known ? undefined : WORKER_LOG_IDLE_MS,
      sizeOf: (path) => this.sizeOf(path),
      isOpen: (path) => this.transports.has(path),
      alter: async (path, task) => {
        const transport = this.transports.get(path.endsWith('.1') ? path.slice(0, -2) : path);
        await (transport ? transport.hold(task) : task());
      },
      warn: (message) => this.warn(message),
    });
  }

  private warn(message: string): void {
    this.warnLogger ??= this.createSystemLogger('Logs', 'server');
    this.warnLogger.warn(message);
  }
}
