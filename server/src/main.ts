#!/usr/bin/env node

process.title = 'camera.ui';

import 'reflect-metadata';
import './utils/env.js';

import { SUPERVISOR_IPC_LEVEL } from '@camera.ui/common/node';
import { randomBytes } from 'node:crypto';

import { checkOrphanedProcesses } from './api/database/checks.js';
import { Database } from './api/database/index.js';
import { tryInject } from './container.js';
import { ProxyServer } from './rpc/index.js';
import { ConfigService } from './services/config/index.js';
import { noteRestoreBootError } from './services/config/restore.js';
import { LoggerService } from './services/logger/index.js';
import { ShutdownOwner } from './shutdown-owner.js';
import { markShuttingDown, resetShuttingDown } from './shutdown-state.js';
import { acquireInstanceLock } from './utils/instance-lock.js';
import { FatalBootError, initAppUpdateListener, reportStartError, sendIPCMessage } from './utils/ipc.js';
import { holdProcessTree, killLeftovers, reapTrackedProcessesOnExit } from './utils/tracked-processes.js';
import { WorkerAgent } from './workers/agent.js';
import { ensureWorkerPaired } from './workers/pairing.js';

import type { CameraUi } from './master.js';

const BOOT_ID = randomBytes(4).toString('hex');

class CameraUiWorker {
  public readonly logger: LoggerService;

  private configService: ConfigService;
  private database: Database;
  private proxy?: ProxyServer;
  private agent?: WorkerAgent;
  private owner: ShutdownOwner;

  constructor() {
    this.logger = new LoggerService();
    this.owner = new ShutdownOwner(this.logger, () => this.close());

    const homePath = process.argv.find((arg) => !arg.startsWith('--') && arg !== process.argv[0] && arg !== process.argv[1]);

    this.configService = new ConfigService(homePath);
    reapTrackedProcessesOnExit(this.configService);

    const logLevel = this.configService.config.logger?.level === 'debug' ? 'debug' : this.configService.config.logger?.level === 'trace' ? 'trace' : 'log';
    this.logger.initLogManager(this.configService.LOGS_PATH, this.configService.LOG_FILE, logLevel);

    // worker mode: only workerStateDB, no migrations or master setup
    this.database = new Database(true);
  }

  public get bootId(): string | undefined {
    return this.agent?.bootId;
  }

  public async start(): Promise<void> {
    resetShuttingDown();

    this.logger.log('---');
    this.logger.log('Starting camera.ui in WORKER mode');
    this.logger.log('---');

    const reaped = await checkOrphanedProcesses(this.configService.processes);
    const killed = reaped.filter((result) => result.killed).length;
    if (killed > 0) {
      this.logger.log(`Stopped ${killed} processes left over from the last run`);
    }

    // the leaf remote needs the stored credentials, an unpaired worker waits in its agent
    const pairing = await ensureWorkerPaired(this.configService, this.logger);

    // no go2rtc and no HTTP server in worker mode
    this.proxy = new ProxyServer({ workerMode: true, masterLink: pairing.state === 'paired' });
    await this.proxy.initialize();
    this.proxy.server.onFatal = () => this.owner.crash();

    this.agent = new WorkerAgent((reason) => this.owner.shutdown(reason), pairing);
    await this.agent.start();
    this.logger.startLogSweep();
  }

  public async close(): Promise<void> {
    markShuttingDown(this.owner.budget);
    sendIPCMessage({ type: 'STOPPING' });

    await this.agent?.close(this.owner.reason);
    await this.proxy?.close();
    await this.database?.close();
    await killLeftovers(this.configService);

    this.logger.log('camera.ui worker has been stopped');
    await this.logger.closeLogManager().catch(() => {});
  }
}

const isWorkerMode = process.argv.includes('--worker') || process.env.CAMERA_UI_WORKER === 'true';

async function launch(): Promise<void> {
  initAppUpdateListener();

  const homeArg = isWorkerMode ? process.argv.find((arg) => !arg.startsWith('--') && arg !== process.argv[0] && arg !== process.argv[1]) : process.argv[2];
  const homePath = ConfigService.resolveHomePath(homeArg);
  if (!(await acquireInstanceLock(homePath))) {
    const error = new FatalBootError(`Another camera.ui is already running with the home ${homePath}. Stop it first or start this one with a different home (-H).`);
    console.error(error.message);
    await reportStartError(error);
    process.exit(1);
  }

  await holdProcessTree();

  if (isWorkerMode) {
    process.title = 'camera.ui-worker';

    let worker: CameraUiWorker | undefined;
    try {
      worker = new CameraUiWorker();
      await worker.start();
      sendIPCMessage({ type: 'STARTED', port: 0, ipc: SUPERVISOR_IPC_LEVEL, role: 'worker', bootId: worker.bootId ?? BOOT_ID });
    } catch (error) {
      (worker?.logger ?? console).error('Failed to start camera.ui worker', error);
      await reportStartError(error);
      await worker?.close();
      process.exit(1);
    }

    return;
  }

  let cameraui: CameraUi | undefined;
  try {
    const { CameraUi } = await import('./master.js');
    cameraui = new CameraUi();
    await cameraui.start();
    sendIPCMessage({ type: 'STARTED', port: cameraui.port, ipc: SUPERVISOR_IPC_LEVEL, role: 'master', bootId: BOOT_ID });
    sendIPCMessage({ type: 'HEALTHY', version: ConfigService.RUNNING_VERSION });
  } catch (error) {
    (cameraui?.logger ?? console).error('Failed to start camera.ui', error);
    const configService = tryInject('configService');
    const rollbackAhead = !!configService && noteRestoreBootError(configService.RESTORE_JOURNAL_FILE, error?.message ?? String(error));

    await reportStartError(error, rollbackAhead);
    await cameraui?.close();

    process.exit(1);
  }
}

launch().catch((error) => {
  console.error('Failed to start camera.ui:', error);
  process.exit(1);
});
