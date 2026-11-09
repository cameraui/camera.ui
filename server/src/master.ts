import { UPDATE_STATE_FILE } from '@camera.ui/common/node';
import { IS_ELECTRON } from '@camera.ui/common/utils';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CameraUiAPI } from './api.js';
import { Database } from './api/database/index.js';
import { Server } from './api/index.js';
import { BackupSchedulerService } from './api/services/backupScheduler.service.js';
import { MoveService } from './api/services/move.service.js';
import { updatesService } from './api/services/updates.service.js';
import { CertificateGeneration } from './api/utils/cert.js';
import { AssistantManager } from './assistant/manager.js';
import { AutomationEngine } from './automations/engine.js';
import { setupNodeAvLog } from './camera/streaming/node-av-log.js';
import { inject, provide } from './container.js';
import { Go2RtcApi } from './go2rtc/api/index.js';
import { Go2Rtc } from './go2rtc/index.js';
import { Go2RtcState } from './go2rtc/state.js';
import { emitInternalEvent, InternalEventBus } from './internal-bus.js';
import { MqttManager } from './mqtt/manager.js';
import { PluginManager } from './plugins/index.js';
import { CloudApi } from './remote/api/index.js';
import { RemoteAccessManager } from './remote/index.js';
import { TunnelClient } from './remote/tunnel/client.js';
import { ProxyServer } from './rpc/index.js';
import { SensorRegistry } from './sensors/registry.js';
import { ConfigService } from './services/config/index.js';
import { isMovedAway, settleMoveRecord } from './services/config/move.js';
import { finishRestore } from './services/config/restore.js';
import { LoggerService } from './services/logger/index.js';
import { ShutdownOwner } from './shutdown-owner.js';
import { markShuttingDown, resetShuttingDown } from './shutdown-state.js';
import { paint } from './utils/colors.js';
import { requestServerUpdate, sendIPCMessage } from './utils/ipc.js';
import { killLeftovers, reapTrackedProcessesOnExit } from './utils/tracked-processes.js';
import { WorkerManager } from './workers/manager.js';

import type { ShutdownReason, UpdateState } from '@camera.ui/common/node';

export class CameraUi {
  public readonly logger: LoggerService;
  public movedAway = false;

  private api: CameraUiAPI;
  private database: Database;
  private configService: ConfigService;
  private remoteAccessManager: RemoteAccessManager;
  private pluginManager: PluginManager;
  private go2rtc: Go2Rtc;
  private go2rtcApi: Go2RtcApi;
  private go2rtcState: Go2RtcState;
  private tunnelClient: TunnelClient;
  private server: Server;
  private cloudApi: CloudApi;
  private proxy: ProxyServer;
  private automationEngine: AutomationEngine;
  private workerManager: WorkerManager;
  private backupScheduler: BackupSchedulerService;
  private mqttManager: MqttManager;
  private assistantManager: AssistantManager;
  private sensorRegistry?: SensorRegistry;
  private owner: ShutdownOwner;

  private homePath: string | undefined;

  public status: 'loading' | 'ready' = 'loading';

  public get port(): number {
    return this.configService.config.port;
  }

  constructor() {
    provide('cameraui', this);

    this.logger = new LoggerService();
    this.owner = new ShutdownOwner(this.logger, () => this.close());

    this.homePath = process.argv[2];

    this.configService = new ConfigService(this.homePath, { applyPendingRestore: true });
    reapTrackedProcessesOnExit(this.configService);

    const logLevel = this.configService.config.logger?.level === 'debug' ? 'debug' : this.configService.config.logger?.level === 'trace' ? 'trace' : 'log';
    this.logger.initLogManager(this.configService.LOGS_PATH, this.configService.LOG_FILE, logLevel);

    setupNodeAvLog(this.logger);

    new InternalEventBus();
    this.api = new CameraUiAPI();
    this.database = new Database();
    this.go2rtc = new Go2Rtc();
    this.go2rtcApi = new Go2RtcApi();
    this.go2rtcState = new Go2RtcState();
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
    this.assistantManager = new AssistantManager();
  }

  public async start(): Promise<void> {
    resetShuttingDown();
    this.movedAway = isMovedAway(settleMoveRecord(this.configService.MOVE_FILE));

    CertificateGeneration.generateCert();

    sendIPCMessage({
      type: 'START_OUTPUT',
      message: 'Initializing database...',
    });

    await this.database.initialize();

    this.configService.reissueSslCertificate();

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
    this.proxy.server.onFatal = () => this.owner.crash();
    if (!this.movedAway) await this.workerManager.start();

    // hydrate sensor entities before MQTT, plugins and cameras come up
    this.sensorRegistry = new SensorRegistry(this.proxy.proxy, this.logger);
    await this.sensorRegistry.init();

    this.logger.log('---');

    sendIPCMessage({
      type: 'START_OUTPUT',
      message: 'Starting server...',
    });

    await this.server.register();
    await this.server.listen();

    if (this.movedAway) {
      await this.startMovedAway();
      return;
    }

    this.remoteAccessManager.start().catch(() => {});
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
    await this.assistantManager.start();

    // after the automation engine started, so flows catch it
    const bus = inject('internalBus');
    bus.emitEvent('system:started', {});
    this.workerManager.markReady();

    await this.reportUpdateState();
    this.reportFinishedRestore();
  }

  public async close(): Promise<void> {
    markShuttingDown(this.owner.budget);

    sendIPCMessage({ type: 'STOPPING' });

    // first, so workers keep their workloads for the next run
    await this.workerManager?.announceShutdown(this.owner.reason).catch(() => {});

    emitInternalEvent('system:shutdown', {});

    this.automationEngine?.stop();
    this.backupScheduler?.stop();
    await this.assistantManager?.stop().catch(() => {});
    await this.mqttManager?.stop().catch(() => {});
    await this.workerManager?.stop().catch(() => {});

    if (this.server.isRunning) {
      await this.server.close().catch(() => {});
    } else {
      await Promise.allSettled([this.server.close(), this.go2rtc.stop(), this.tunnelClient.stop()]);
    }

    await Promise.allSettled(Array.from(this.pluginManager.plugins).map(([, plugin]) => plugin.worker.teardown()));

    await this.sensorRegistry?.destroy().catch(() => {});
    this.sensorRegistry = undefined;

    // nats closes before the leftovers are killed, so nothing dies mid-write
    await Promise.allSettled([this.proxy.close()]);
    await killLeftovers(this.configService);

    await this.database?.close().catch(() => {});

    this.logger.log('camera.ui has been stopped');
    await this.logger.closeLogManager().catch(() => {});
  }

  public shutdown(reason: ShutdownReason): Promise<void> {
    return this.owner.shutdown(reason);
  }

  public async restart(): Promise<void> {
    this.logger.log('Restarting camera.ui...');

    if (IS_ELECTRON) {
      await this.owner.shutdown('restart');
      return;
    }

    await this.close();
    await this.start();
  }

  public async requestUpdate(version?: string): Promise<AsyncGenerator<string, void, unknown>> {
    return requestServerUpdate(version);
  }

  private async startMovedAway(): Promise<void> {
    this.logger.warn('This server moved to a new one, its cameras, plugins and workers stay stopped here. Settings, Backup lets it run here again.');
    await this.pluginManager.loadInstalledPlugins();
    this.setStatus('ready');
    // an undo can bring the moved-away state back, and this start goes no further
    this.reportFinishedRestore();
    new MoveService().continueMovedAway(() => this.shutdown('restart'));
  }

  private reportFinishedRestore(): void {
    const restore = finishRestore(this.configService.RESTORE_JOURNAL_FILE);
    if (restore?.state === 'done-with-problems') {
      this.logger.warn('The restore is finished, some plugins from the backup are not installed yet');
    } else if (restore) {
      this.logger.log('The restore is finished');
    }
  }

  private async initializePlugins(): Promise<void> {
    sendIPCMessage({
      type: 'START_OUTPUT',
      message: 'Starting plugins...',
    });

    await this.pluginManager.initializeInstalledPlugins();
    this.setStatus('ready');
    updatesService().reportRestartFailures();

    sendIPCMessage({
      type: 'START_OUTPUT',
      message: 'All plugins initialized',
    });

    this.logger.log(paint('green', 'All plugins initialized'));
  }

  private setStatus(status: 'loading' | 'ready'): void {
    this.status = status;
    this.server.app?.io.of('/camera.ui').emit('status', status);

    if (status === 'ready') {
      this.logger.startLogSweep(() => ({ cameras: new Set(this.database.camerasDB.getKeys()), plugins: new Set(this.database.pluginsDB.getKeys()) }));
    }
  }

  private async reportUpdateState(): Promise<void> {
    try {
      const state = JSON.parse(await readFile(join(this.configService.HOME_PATH, 'server', UPDATE_STATE_FILE), 'utf8')) as UpdateState;
      if (state.result !== 'applied' && state.at > Date.now() - 24 * 60 * 60 * 1000) {
        this.logger.warn(
          `The update to ${state.target} was not applied (${state.result}${state.reason ? `: ${state.reason}` : ''}), running ${ConfigService.RUNNING_VERSION}`,
        );
      }
    } catch {
      // ignore
    }
  }
}
