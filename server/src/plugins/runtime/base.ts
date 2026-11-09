import { Logger } from '@camera.ui/common/logger';
import { API_EVENT } from '@camera.ui/sdk';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';

import { inject, tryInject } from '../../container.js';
import { CLOUD_SERVICE_URL } from '../../services/config/constants.js';
import { exitInfo } from '../../utils/process-exit.js';
import { PLUGIN_STOP_BUDGET_MS, SupervisedChild, supervisedSpawn } from '../../utils/supervised-child.js';

import type { LogEntry } from '@camera.ui/common/logger';
import type { ChildProcess } from 'node:child_process';
import type { CameraUiAPI } from '../../api.js';
import type { ProxyServer } from '../../rpc/index.js';
import type { ConfigService } from '../../services/config/index.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { LogManager } from '../../services/logger/logManager.js';
import type { ChildExit, SupervisedSpawn } from '../../utils/supervised-child.js';
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
  on(event: 'exit', listener: (exit: ChildExit) => void): this;
  once(event: 'exit', listener: (exit: ChildExit) => void): this;
  off(event: 'exit', listener: (exit: ChildExit) => void): this;
  emit(event: 'exit', exit: ChildExit): boolean;
  removeListener(event: 'exit', listener: (exit: ChildExit) => void): this;
}

export abstract class BasePluginRuntime extends EventEmitter {
  public readonly logger: Logger;
  public logForwarder?: (entry: LogEntry) => void;

  protected configService: ConfigService;
  protected proxyServer: ProxyServer;

  protected api?: CameraUiAPI;
  protected pluginManager?: PluginManager;

  protected worker?: ChildProcess;
  protected child?: SupervisedChild;
  protected pendingSpawn?: SupervisedSpawn;

  private loggerService: LoggerService;
  private logManager: LogManager;
  private logBuffer = '';
  private isShuttingDown = false;
  private stopRequested = false;

  constructor(protected plugin: RuntimePlugin) {
    super();

    this.loggerService = inject('logger');
    this.configService = inject('configService');
    this.proxyServer = inject('proxy');
    this.logManager = inject('logManager');
    this.api = tryInject('api');
    this.pluginManager = tryInject('pluginManager');

    this.logger = this.loggerService.createPluginLogger(plugin.id, plugin.displayName, plugin.info.installedVersion);

    if (this.api) {
      this.api.setMaxListeners(this.api.getMaxListeners() + 1);
      this.api.once(API_EVENT.SHUTDOWN, () => {
        this.isShuttingDown = true;
        if (this.worker) {
          this.once('exit', () => setImmediate(() => this.cleanup()));
        } else {
          this.cleanup();
        }
      });
    }
  }

  public abstract start(signal?: AbortSignal, instanceId?: string): Promise<void>;

  public prepare(_signal?: AbortSignal): Promise<void> {
    return Promise.resolve();
  }

  public async stop(budgetMs?: number): Promise<void> {
    this.stopRequested = true;
    await this.child?.stop(budgetMs);
  }

  public kill(): void {
    this.stopRequested = true;
    this.child?.kill();
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

  public get instanceId(): string | undefined {
    return this.child?.instanceId;
  }

  protected prepareSpawn(instanceId?: string): SupervisedSpawn {
    this.pendingSpawn = supervisedSpawn(PLUGIN_STOP_BUDGET_MS, { signalStop: this.plugin.isGo, instanceId });
    return this.pendingSpawn;
  }

  protected attach(
    worker: ChildProcess,
    spawn: SupervisedSpawn,
    info: { command: string; args: string[]; titles: string[] },
    resolve: (value: void | PromiseLike<void>) => void,
    reject: (reason?: any) => void,
  ): void {
    this.worker = worker;

    worker.once('spawn', () => {
      this.child = new SupervisedChild(worker, spawn, { role: 'plugin', ...info });
      this.logger.log(`Initializing process with PID: ${worker.pid}`);
      resolve();
    });
    worker.on('error', this.onError.bind(this, reject));
    worker.on('exit', this.onExit.bind(this));

    worker.stdout?.on('data', this.onData.bind(this));
    worker.stderr?.on('data', this.onData.bind(this));
  }

  protected onError(reject: (reason?: any) => void, error: Error): void {
    this.logger.error(`The plugin process for "${this.plugin.pluginName}" reported an error!`, error);
    reject(error);
  }

  protected onExit(code: number | null, signal: NodeJS.Signals | null): void {
    const expected = this.stopRequested || this.isShuttingDown || Boolean(this.child?.requested);
    this.stopRequested = false;
    const exit: ChildExit = { code, signal, requested: expected, uptimeMs: this.child ? Date.now() - this.child.startedAt : 0 };

    const details = exitInfo(code, signal, { pid: this.worker?.pid, startTime: this.child?.startedAt });

    if (expected) {
      this.logger.log(`Plugin ${this.plugin.displayName} exited (${details})`);
    } else {
      this.logger.error(`Plugin ${this.plugin.displayName} exited unexpectedly (${details})`);
    }

    // clients get sensor:removed, entities and assignments stay for re-registration
    tryInject('sensorRegistry')?.removePluginSensors(this.plugin.id);

    this.worker = undefined;
    this.child = undefined;
    this.emit('exit', exit);
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

  protected processEnv(): Record<string, string> {
    const env = { ...process.env } as Record<string, string>;

    delete env.CAMERA_UI_STORAGE_PATH;
    delete env.CAMERA_UI_DATABASE_PATH;
    delete env.CAMERA_UI_USERS_STORAGE_PATH;
    delete env.CAMERA_UI_PLUGINS_STORAGE_PATH;
    delete env.CAMERA_UI_PLUGINS_INSTALL_PATH;
    delete env.CAMERA_UI_PLUGINS_PJSON_FILE;
    delete env.CAMERA_UI_CONFIG_FILE;
    delete env.CAMERA_UI_SECRETS_FILE;
    delete env.CAMERA_UI_LOG_FILE;
    delete env.CAMERA_UI_GO2RTC_CONFIG_FILE;
    delete env.CAMERA_UI_GO2RTC_BINARY;
    delete env.CAMERA_UI_CLOUD_BINARY;
    delete env.CAMERA_UI_PORT;
    delete env.CAMERA_UI_INSECURE_PORT;
    delete env.CAMERA_UI_UI_PORT;

    return env;
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
      PLUGIN_CONFIG_STORE_RPC: !this.api ? '1' : undefined,
      ...(this.plugin.remoteEnv ?? {}),
      ...this.pendingSpawn?.env,
      CAMERA_UI_RUNMODE: process.env.CAMERA_UI_RUNMODE,
      ENV_MODE: process.env.NODE_ENV,
      CLOUD_MODE: CLOUD_SERVICE_URL === 'https://cloud.cameraui.com' ? 'production' : 'development',
    };
  }

  private processLogLine(line: string): void {
    // stack frames keep their indent
    const text = line.trimEnd();
    if (!text.trim() || text.includes('returning true from eof_received')) {
      return;
    }

    const entry: LogEntry = Logger.parseChildLog(text) ?? {
      timestamp: Date.now(),
      level: 'raw',
      prefix: '',
      message: text,
      targetId: this.plugin.id,
      targetType: 'plugin',
      source: 'child',
      processId: this.worker?.pid,
    };

    this.logManager.handleChildLog(entry);

    // on a worker the master notes the line when the forwarded copy arrives
    if (this.logForwarder) this.logForwarder(entry);
    else this.proxyServer.notificationManager.notePluginLog(this.plugin.id, entry);
  }
}
