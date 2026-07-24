#!/usr/bin/env node

process.title = 'camera.ui';

import 'reflect-metadata';
import './utils/env.js';

import { IS_ELECTRON, SignalHandler, sleep } from '@camera.ui/common/utils';
import { green } from 'ansicolor';
import fkill from 'fkill';
import { execSync } from 'node:child_process';
import { container } from 'tsyringe';

import { CameraUiAPI } from './api.js';
import { Database } from './api/database/index.js';
import { Server } from './api/index.js';
import { BackupSchedulerService } from './api/services/backupScheduler.service.js';
import { CertificateGeneration } from './api/utils/cert.js';
import { AutomationEngine } from './automations/engine.js';
import { setupNodeAvLog } from './camera/streaming/node-av-log.js';
import { Go2RtcApi } from './go2rtc/api/index.js';
import { Go2Rtc } from './go2rtc/index.js';
import { InternalEventBus } from './internal-bus.js';
import { MqttManager } from './mqtt/manager.js';
import { PluginManager } from './plugins/index.js';
import { CloudApi } from './remote/api/index.js';
import { RemoteAccessManager } from './remote/index.js';
import { TunnelClient } from './remote/tunnel/client.js';
import { ProxyServer } from './rpc/index.js';
import { ConfigService } from './services/config/index.js';
import { LoggerService } from './services/logger/index.js';
import { markShuttingDown, resetShuttingDown } from './shutdown-state.js';
import { reportStartError, sendIPCMessage } from './utils/ipc.js';
import { WorkerAgent } from './workers/agent.js';
import { WorkerManager } from './workers/manager.js';
import { ensureWorkerPaired } from './workers/pairing.js';

import type { CLIMessage } from './types.js';

class CameraUi {
  public readonly logger: LoggerService;

  private api: CameraUiAPI;
  private database: Database;
  private configService: ConfigService;
  private remoteAccessManager: RemoteAccessManager;
  private pluginManager: PluginManager;
  private go2rtc: Go2Rtc;
  private go2rtcApi: Go2RtcApi;
  private tunnelClient: TunnelClient;
  private server: Server;
  private cloudApi: CloudApi;
  private proxy: ProxyServer;
  private automationEngine: AutomationEngine;
  private workerManager: WorkerManager;
  private backupScheduler: BackupSchedulerService;
  private mqttManager: MqttManager;
  private signalHandler: SignalHandler;

  private homePath: string | undefined;

  public status: 'loading' | 'ready' = 'loading';

  public get port(): number {
    return this.configService.config.port;
  }

  constructor() {
    container.registerInstance('cameraui', this);

    this.logger = new LoggerService();

    this.signalHandler = new SignalHandler({
      displayName: '[Signal]',
      timeoutDuration: 5000,
      logger: this.logger,
      closeFunction: this.close.bind(this),
    });

    this.homePath = process.argv[2];

    this.configService = new ConfigService(this.homePath);
    reapTrackedProcessesOnExit(this.configService);

    const logLevel = this.configService.config.logger?.level === 'debug' ? 'debug' : this.configService.config.logger?.level === 'trace' ? 'trace' : 'log';
    this.logger.initLogManager(this.configService.LOGS_PATH, this.configService.LOG_FILE, logLevel);

    setupNodeAvLog(this.logger);

    new InternalEventBus();
    this.api = new CameraUiAPI();
    this.database = new Database();
    this.go2rtc = new Go2Rtc();
    this.go2rtcApi = new Go2RtcApi();
    this.pluginManager = new PluginManager();
    this.proxy = new ProxyServer();
    this.cloudApi = new CloudApi();
    this.remoteAccessManager = new RemoteAccessManager();
    this.tunnelClient = new TunnelClient();
    this.server = new Server();
    this.automationEngine = new AutomationEngine();
    this.workerManager = new WorkerManager();
    this.backupScheduler = new BackupSchedulerService();
    this.mqttManager = new MqttManager();
  }

  public async start(): Promise<void> {
    resetShuttingDown();

    CertificateGeneration.generateCert();

    sendIPCMessage({
      type: 'START_OUTPUT',
      message: 'Initializing database...',
    });

    await this.database.initialize();

    sendIPCMessage({
      type: 'START_OUTPUT',
      message: 'Initializing camera engine...',
    });

    await this.go2rtc.start();

    sendIPCMessage({
      type: 'START_OUTPUT',
      message: 'Initializing proxy...',
    });

    await this.proxy.initialize();
    await this.workerManager.start();

    this.logger.log('---');

    sendIPCMessage({
      type: 'START_OUTPUT',
      message: 'Starting server...',
    });

    this.remoteAccessManager.start().catch(() => {});
    await this.server.register();
    await this.server.listen();
    await this.tunnelClient.start();
    await this.mqttManager.start();

    this.logger.log('---');

    this.setStatus('loading');

    sendIPCMessage({
      type: 'START_OUTPUT',
      message: 'Initializing plugins...',
    });

    await this.pluginManager.initializePlugins();

    sendIPCMessage({
      type: 'START_OUTPUT',
      message: 'Configuring cameras...',
    });

    await this.api.configureCameras();

    this.initializePlugins();

    sendIPCMessage({
      type: 'START_OUTPUT',
      message: 'Starting automation engine...',
    });

    await this.automationEngine?.start();
    this.backupScheduler.start();

    // Emit system:started AFTER engine is ready so flows can catch it
    const bus = container.resolve<InternalEventBus>('internalBus');
    bus.emitEvent('system:started', {});
  }

  public async close(): Promise<void> {
    markShuttingDown();

    sendIPCMessage({ type: 'STOPPING' });

    try {
      const bus = container.resolve<InternalEventBus>('internalBus');
      bus.emitEvent('system:shutdown', {});
    } catch {
      // ignore
    }

    this.automationEngine?.stop();
    this.backupScheduler?.stop();
    await this.mqttManager?.stop().catch(() => {});
    await this.workerManager?.stop().catch(() => {});

    if (this.server.isRunning) {
      await this.server.close().catch(() => {});
    } else {
      await Promise.allSettled([this.server.close(), this.go2rtc.stop(), this.tunnelClient.stop()]);
    }

    await Promise.allSettled(Array.from(this.pluginManager.plugins).map(([, plugin]) => plugin.worker.teardown(true)));

    await sleep(500);

    const processes = this.configService.processes;
    await fkill(
      processes.map((process) => process.pid),
      { force: true, silent: true },
    );

    await Promise.allSettled([this.proxy.close()]);

    await this.database?.close().catch(() => {});

    this.logger.log('camera.ui has been stopped');
  }

  public async restart(): Promise<void> {
    this.logger.log('Restarting camera.ui...');

    if (IS_ELECTRON) {
      process.kill(process.pid, 'SIGTERM');
      return;
    }

    await this.close();
    await this.start();
  }

  public async requestUpdate(version?: string): Promise<AsyncGenerator<string, void, unknown>> {
    if (IS_ELECTRON) {
      throw new Error('Server updates are managed by the desktop app');
    }

    if (!process.send) {
      throw new Error('Cannot update server: No CLI process found');
    }

    sendIPCMessage({
      type: 'UPDATE_SERVER',
      version: version,
    });

    // prettier-ignore
    const messageHandler = async function *() {
      let resolver: ((value: { done: boolean; value?: string }) => void) | null = null;
      let rejector: ((error: Error) => void) | null = null;

      const messageQueue: { done: boolean; value?: string }[] = [];
      let updateFailed = false;
      let updateError: Error | null = null;

      const timer = setTimeout(
        () => {
          if (resolver) {
            rejector?.(new Error('Update timeout after 5 minutes'));
          }
        },
        5 * 60 * 1000,
      );

      const handler = (message: CLIMessage) => {
        switch (message.type) {
          case 'UPDATE_OUTPUT':
          case 'UPDATE_ERROR': {
            const result = { done: false, value: message.data };
            if (resolver) {
              resolver(result);
              resolver = null;
            } else {
              messageQueue.push(result);
            }
            break;
          }
          case 'UPDATE_FAILED': {
            updateFailed = true;
            updateError = new Error(message.error ?? 'Update failed');
            if (rejector) {
              rejector(updateError);
            }
            process.removeListener('message', handler);
            clearTimeout(timer);
            break;
          }
          case 'UPDATE_COMPLETE': {
            const result = { done: true };
            if (resolver) {
              resolver(result);
              resolver = null;
            } else {
              messageQueue.push(result);
            }
            process.removeListener('message', handler);
            clearTimeout(timer);
            break;
          }
        }
      };

      process.on('message', handler);

      try {
        while (true) {
          if (updateFailed) {
            throw updateError!;
          }

          if (messageQueue.length > 0) {
            const next = messageQueue.shift()!;
            if (next.done) {
              return;
            }
            if (next.value) {
              yield next.value;
            }
          } else {
            const next = await new Promise<{ done: boolean; value?: string }>((resolve, reject) => {
              resolver = resolve;
              rejector = reject;
            });

            if (next.done) {
              return;
            }
            if (next.value) {
              yield next.value;
            }
          }
        }
      } finally {
        process.removeListener('message', handler);
        clearTimeout(timer);
      }
    };

    return messageHandler();
  }

  private async initializePlugins(): Promise<void> {
    sendIPCMessage({
      type: 'START_OUTPUT',
      message: 'Starting plugins...',
    });

    await this.pluginManager.initializeInstalledPlugins();
    this.setStatus('ready');

    sendIPCMessage({
      type: 'START_OUTPUT',
      message: 'All plugins initialized',
    });

    this.logger.log(green('All plugins initialized'));
  }

  private setStatus(status: 'loading' | 'ready'): void {
    this.status = status;
    this.server.app?.io.of('/camera.ui').emit('status', status);
  }
}

class CameraUiWorker {
  public readonly logger: LoggerService;

  private configService: ConfigService;
  private database: Database;
  private proxy: ProxyServer;
  private agent!: WorkerAgent;
  private signalHandler: SignalHandler;

  constructor() {
    container.registerInstance('cameraui', this);

    this.logger = new LoggerService();

    this.signalHandler = new SignalHandler({
      displayName: '[Signal]',
      timeoutDuration: 5000,
      logger: this.logger,
      closeFunction: this.close.bind(this),
    });

    const homePath = process.argv.find((arg) => !arg.startsWith('--') && arg !== process.argv[0] && arg !== process.argv[1]);
    this.configService = new ConfigService(homePath);
    reapTrackedProcessesOnExit(this.configService);

    const logLevel = this.configService.config.logger?.level === 'debug' ? 'debug' : this.configService.config.logger?.level === 'trace' ? 'trace' : 'log';
    this.logger.initLogManager(this.configService.LOGS_PATH, this.configService.LOG_FILE, logLevel);

    // Worker-mode database: only opens workerStateDB, skips migrations + master setup.
    this.database = new Database(true);

    // No Go2RTC, no HTTP server in worker mode
    this.proxy = new ProxyServer({ workerMode: true });
  }

  public async start(): Promise<void> {
    resetShuttingDown();

    this.logger.log('---');
    this.logger.log('Starting camera.ui in WORKER mode');
    this.logger.log('---');

    // Must run before the proxy: the leaf-node remote is built from the
    // credentials this obtains/stores.
    await ensureWorkerPaired(this.configService, this.logger);

    await this.proxy.initialize();

    this.agent = new WorkerAgent();
    await this.agent.start();

    this.logger.log('Worker is ready and connected to master');
  }

  public async close(): Promise<void> {
    markShuttingDown();

    await this.agent?.close();
    await this.proxy?.close();
    await this.database?.close();

    await sleep(1000);

    const processes = this.configService.processes;
    await fkill(
      processes.map((p) => p.pid),
      { force: true, silent: true },
    );
  }
}

const isWorkerMode = process.argv.includes('--worker') || process.env.CAMERA_UI_WORKER === 'true';

function reapTrackedProcessesOnExit(configService: ConfigService): void {
  process.on('exit', () => {
    for (const proc of configService.processes) {
      try {
        if (process.platform === 'win32') {
          // TerminateProcess doesn't touch children — go2rtc's own ffmpeg
          // processes would survive. taskkill /T takes the whole tree.
          execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
        } else {
          process.kill(proc.pid, 'SIGKILL');
        }
      } catch {
        // already gone
      }
    }
  });
}

async function launch(): Promise<void> {
  if (isWorkerMode) {
    process.title = 'camera.ui-worker';

    const worker = new CameraUiWorker();
    const logger = worker.logger;

    try {
      await worker.start();
      sendIPCMessage({ type: 'STARTED', port: 0 });
    } catch (error) {
      logger.error('Failed to start camera.ui worker', error);
      await reportStartError(error);
      await worker.close();
      process.exit(1);
    }

    return;
  }

  const cameraui = new CameraUi();
  const logger = cameraui.logger;

  try {
    await cameraui.start();
    sendIPCMessage({ type: 'STARTED', port: cameraui.port });
  } catch (error) {
    logger.error('Failed to start camera.ui', error);

    await reportStartError(error);
    await cameraui.close();

    process.exit(1);
  }
}

launch();

export type { CameraUi };
