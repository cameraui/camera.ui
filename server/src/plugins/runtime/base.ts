import { Logger } from '@camera.ui/common/logger';
import { API_EVENT } from '@camera.ui/sdk';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { container } from 'tsyringe';

import { CLOUD_SERVICE_URL } from '../../services/config/constants.js';

import type { LogEntry } from '@camera.ui/common/logger';
import type { ChildProcess } from 'node:child_process';
import type { CameraUiAPI } from '../../api.js';
import type { ProcInfo } from '../../api/database/checks.js';
import type { ProxyServer } from '../../rpc/index.js';
import type { ConfigService } from '../../services/config/index.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { LogManager } from '../../services/logger/logManager.js';
import type { PluginManager } from '../index.js';

export interface RuntimePlugin {
  id: string;
  pluginName: string;
  displayName: string;
  main: string;
  mainPath: string;
  installPath: string;
  isPython: boolean;
  isGo: boolean;
  info: { installedVersion?: string };
  contract: { pythonVersion?: string };
  remoteEnv?: Record<string, string | undefined>;
}

export declare interface BasePluginRuntime {
  on(event: 'exit', listener: () => void): this;
  once(event: 'exit', listener: () => void): this;
  off(event: 'exit', listener: () => void): this;
  emit(event: 'exit'): boolean;
  removeListener(event: 'exit', listener: () => void): this;
}

export abstract class BasePluginRuntime extends EventEmitter {
  public readonly logger: Logger;
  public logForwarder?: (entry: LogEntry) => void;

  protected configService: ConfigService;
  protected proxyServer: ProxyServer;

  // Master-only; absent when the runtime is hosted on a remote worker.
  protected api?: CameraUiAPI;
  protected pluginManager?: PluginManager;

  protected worker?: ChildProcess;
  protected processInfo?: ProcInfo;

  private loggerService: LoggerService;
  private logManager: LogManager;
  private logBuffer = '';
  private isShuttingDown = false;

  constructor(protected plugin: RuntimePlugin) {
    super();

    this.loggerService = container.resolve<LoggerService>('logger');
    this.configService = container.resolve<ConfigService>('configService');
    this.proxyServer = container.resolve<ProxyServer>('proxy');
    this.logManager = container.resolve('logManager');
    this.api = container.isRegistered('api') ? container.resolve<CameraUiAPI>('api') : undefined;
    this.pluginManager = container.isRegistered('pluginManager') ? container.resolve<PluginManager>('pluginManager') : undefined;

    this.logger = this.loggerService.createPluginLogger(plugin.id, plugin.displayName, plugin.info.installedVersion);

    if (this.api) {
      this.api.setMaxListeners(this.api.getMaxListeners() + 1);
      this.api.once(API_EVENT.SHUTDOWN, () => {
        this.isShuttingDown = true;
        this.cleanup();
      });
    }
  }

  public abstract start(): Promise<void>;

  public stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.worker || this.worker.killed) {
        resolve();
        return;
      }

      const killTimeout = setTimeout(() => {
        this.logger.warn(`Plugin ${this.plugin.displayName} did not terminate gracefully. Forcing closure.`);
        this.worker?.kill('SIGKILL');
        resolve();
      }, 3000);

      this.worker.once('close', (code, signal) => {
        clearTimeout(killTimeout);
        this.logger.log(`Plugin ${this.plugin.displayName} closed. Code: ${code}, Signal: ${signal}`);
        this.worker = undefined;
        resolve();
      });

      this.worker.kill('SIGTERM');
    });
  }

  public kill(): void {
    this.worker?.kill('SIGKILL');
  }

  public getPID(): number {
    return this.worker?.pid ?? 0;
  }

  public isRunning(): boolean {
    return !!this.worker && !this.worker?.killed;
  }

  public cleanup(): void {
    this.loggerService.removePluginLogger(this.plugin.id);
    this.removeAllListeners();
  }

  protected onSpawn(pid: number, command: string, args: string[], titles: string[], resolve: (value: void | PromiseLike<void>) => void): void {
    this.logger.log(`Initializing process with PID: ${pid}`);

    this.processInfo = this.configService.addProcess({
      pid,
      command,
      args,
      titles,
      startTime: Date.now(),
    });

    resolve();
  }

  protected onError(reject: (reason?: any) => void, error: Error): void {
    this.logger.error(`The plugin process for "${this.plugin.pluginName}" failed to start/stop!`, error);
    reject(error);
  }

  protected onExit(): void {
    this.logger.log(`Plugin ${this.plugin.displayName} exited`);

    // Remove all sensors from this plugin when it exits so clients receive
    // sensor:removed events and re-registration on restart stays clean.
    // (Master-only — on a remote worker the master handles sensor cleanup.)
    const cameras = this.api?.getCameras() ?? [];
    cameras.forEach((camera) => camera.removePluginSensors(this.plugin.id));

    this.configService.removeProcessByPID(this.processInfo?.pid);
    this.worker = undefined;
    this.processInfo = undefined;
    this.emit('exit');
  }

  protected onData(data: Buffer): void {
    const rawData = data.toString();
    this.logBuffer += rawData;

    const lines = this.logBuffer.split('\n');
    this.logBuffer = lines.pop() ?? '';

    for (const line of lines) {
      this.processLogLine(line);
    }
  }

  protected getEnv(): Record<string, string | undefined> {
    const pluginEnv: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('CAMERAUI_PLUGIN_')) {
        pluginEnv[key] = value;
      }
    }

    return {
      ...pluginEnv,
      WORKER_NAME: this.plugin.displayName,
      PLUGIN_ID: this.plugin.id,
      PLUGIN_NAME: this.plugin.pluginName,
      FORCE_COLOR: '1',
      PROXY_USER: this.proxyServer.auth.server.user,
      PROXY_PASSWORD: this.proxyServer.auth.server.password,
      PROXY_ENDPOINTS: this.proxyServer.server.endpoints.join(','),
      PROXY_CERT: this.configService.ssl.cert.toString('utf-8'),
      PROXY_KEY: this.configService.ssl.key.toString('utf-8'),
      PROXY_CA: this.configService.ssl.ca.toString('utf-8'),
      LOGGER_LEVEL: this.configService.config.logger.level,
      MODULE_PATH: join(this.plugin.installPath, this.plugin.main),
      PLUGIN_STORAGE_PATH: join(this.configService.PLUGINS_STORAGE_PATH, this.plugin.pluginName),
      PLUGIN_REMOTE_MODE: this.api ? undefined : '1',
      CAMERAUI_FFMPEG_PATH: this.api ? undefined : this.configService.go2rtcConfig.ffmpeg.bin,
      PLUGIN_CONFIG_STORE_RPC: !this.api || this.plugin.isGo ? '1' : undefined,
      ...(this.plugin.remoteEnv ?? {}),
      CAMERA_UI_RUNMODE: process.env.CAMERA_UI_RUNMODE,
      ENV_MODE: process.env.NODE_ENV,
      CLOUD_MODE: CLOUD_SERVICE_URL === 'https://cloud.cameraui.com' ? 'production' : 'development',
    };
  }

  private processLogLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed || trimmed.includes('returning true from eof_received')) {
      return;
    }

    const entry: LogEntry = Logger.parseChildLog(trimmed) ?? {
      // Raw output (e.g., Python output, errors) - create a raw entry
      timestamp: Date.now(),
      level: 'raw',
      prefix: '',
      message: trimmed,
      targetId: this.plugin.id,
      targetType: 'plugin',
      source: 'child',
      processId: this.worker?.pid,
    };

    this.logManager.handleChildLog(entry);
    this.logForwarder?.(entry);
  }
}
