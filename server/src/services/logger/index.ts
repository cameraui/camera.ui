import { Logger } from '@camera.ui/common/logger';
import { container } from 'tsyringe';

import { LogManager } from './logManager.js';

import type { LoggerOptions } from '@camera.ui/common/logger';

export class LoggerService extends Logger {
  private logManager?: LogManager;

  constructor(options?: LoggerOptions) {
    super({ ...options, prefix: 'camera.ui', targetId: 'server', targetType: 'system' });
    container.registerInstance('logger', this);
  }

  public initLogManager(logsPath: string, systemLogPath: string, logLevel?: 'log' | 'debug' | 'trace'): LogManager {
    this.logManager = new LogManager({
      logsPath,
      systemLogPath,
      logLevel,
    });

    container.registerInstance('logManager', this.logManager);

    this.onLog((entry) => {
      (this.logManager as any)?.route(entry);
    });

    return this.logManager;
  }

  public getLogManager(): LogManager | undefined {
    return this.logManager;
  }

  public createCameraLogger(cameraId: string, cameraName: string): Logger {
    if (this.logManager) {
      return this.logManager.createCameraLogger(cameraId, cameraName);
    }
    return this.createLogger({ prefix: cameraName, targetId: cameraId, targetType: 'camera' });
  }

  public createPluginLogger(pluginId: string, pluginName: string, version?: string): Logger {
    if (this.logManager) {
      return this.logManager.createPluginLogger(pluginId, pluginName, version);
    }
    return this.createLogger({ prefix: pluginName, targetId: pluginId, targetType: 'plugin' });
  }

  public createSystemLogger(prefix: string, sourceId?: string, suffix?: string): Logger {
    if (this.logManager) {
      return this.logManager.createSystemLogger(prefix, sourceId, suffix);
    }
    return this.createLogger({ prefix, suffix, targetId: sourceId, targetType: 'system' });
  }

  public getCameraLogPath(cameraId: string): string | undefined {
    return this.logManager?.getCameraLogPath(cameraId);
  }

  public getPluginLogPath(pluginId: string): string | undefined {
    return this.logManager?.getPluginLogPath(pluginId);
  }

  public getSystemLogPath(sourceId: string): string | undefined {
    return this.logManager?.getSystemLogPath(sourceId);
  }

  public removeCameraLogger(cameraId: string): void {
    this.logManager?.removeCameraLogger(cameraId);
  }

  public removePluginLogger(pluginId: string): void {
    this.logManager?.removePluginLogger(pluginId);
  }

  public setLogLevel(level: 'log' | 'debug' | 'trace'): void {
    this.logManager?.setLogLevel(level);

    this.debugEnabled = level === 'debug' || level === 'trace';
    this.traceEnabled = level === 'trace';
  }

  public async closeLogManager(): Promise<void> {
    await this.logManager?.close();
  }
}
