import { Logger } from '@camera.ui/common/logger';
import { IS_DEV, IS_ELECTRON, isEqual, sleep, Subscribed } from '@camera.ui/common/utils';
import { fork } from 'node:child_process';
import { container } from 'tsyringe';

import { PLUGIN_STATUS } from '../../plugins/types.js';
import { NamespaceManager } from '../../rpc/namespaces.js';
import { isShuttingDown } from '../../shutdown-state.js';
import { nodeDecoderPath } from '../../utils/path.js';
import { PythonInstaller } from '../../utils/pythonInstaller.js';

import type { LogEntry } from '@camera.ui/common/logger';
import type { PrivateChannel, Promisify } from '@camera.ui/rpc';
import type {
  CameraDetectionSettings,
  CameraFrameWorkerSettings,
  CameraInput,
  CameraUiSettings,
  DetectionLine,
  DetectionZone,
  PtzAutotrackSettings,
  StreamingRole,
} from '@camera.ui/sdk';
import type { ChildProcess } from 'node:child_process';
import type { SocketService } from '../../api/websocket/index.js';
import type { WorkerRuntime } from '../../api/websocket/types.js';
import type { ProxyServer } from '../../rpc/index.js';
import type { FrameWorkerChildInterface } from '../../rpc/interfaces/frameworker.js';
import type { FrameWorkerNamespaces } from '../../rpc/namespaces.js';
import type { ConfigService } from '../../services/config/index.js';
import type { LogManager } from '../../services/logger/logManager.js';
import type { WorkerManager } from '../../workers/manager.js';
import type { CameraController } from '../controller.js';
import type { CoordinatorSourceUrl } from './detection-coordinator.js';
import type { WorkerToMainMessage } from './types.js';

const REMOTE_START_TIMEOUT_MS = 30_000;

export class FrameWorker extends Subscribed {
  private readonly configService: ConfigService;
  private readonly socketService: SocketService;
  private readonly proxyServer: ProxyServer;
  private readonly logManager: LogManager;
  private readonly py: PythonInstaller;
  private readonly workerManager: WorkerManager;

  private isClosed = false;
  private isRestarting = false;
  private isRemote = false;
  private process?: ChildProcess;
  private retryTimeout?: NodeJS.Timeout;
  private remoteStartTimeout?: NodeJS.Timeout;
  private channel?: PrivateChannel;
  private namespaces: FrameWorkerNamespaces;
  private _status: PLUGIN_STATUS = PLUGIN_STATUS.UNKNOWN;

  private readonly logger: Logger;
  private logBuffer = '';

  public get name(): string {
    return this.camera.name;
  }

  public get status(): PLUGIN_STATUS {
    return this._status;
  }

  public get isRemoteWorker(): boolean {
    return this.isRemote;
  }

  constructor(private readonly camera: CameraController) {
    super();

    this.configService = container.resolve('configService');
    this.socketService = container.resolve('socketService');
    this.proxyServer = container.resolve('proxy');
    this.logManager = container.resolve('logManager');
    this.workerManager = container.resolve('workerManager');

    // Initialize logger for Frame Worker messages
    this.logger = (camera.logger as Logger).createLogger({
      prefix: 'Frame Worker',
      suffix: camera.name,
      targetId: camera.id,
      targetType: 'camera',
    });

    this.namespaces = NamespaceManager.frameWorkerNamespaces(camera.id);
    this.py = new PythonInstaller(this.configService.HOME_PATH, this.logger);

    this.setupEventListeners();
  }

  public async start(): Promise<void> {
    if (this.status === PLUGIN_STATUS.STARTING || this.status === PLUGIN_STATUS.STARTED) {
      return;
    }

    if (this.camera.disabled) {
      this.logger.debug('Camera is disabled, worker will not start');
      return;
    }

    if (this.camera.snooze) {
      this.logger.debug('Camera is snoozed, worker will not start');
      return;
    }

    if (!this.camera.connected) {
      this.logger.debug('Camera not connected, worker will not start');
      return;
    }

    // Clear any existing retry timeout
    this.isClosed = false;
    this.isRestarting = false;
    clearTimeout(this.retryTimeout);
    this.retryTimeout = undefined;

    try {
      await this.startWorkerProcess();
    } catch (error) {
      this.setStatus(PLUGIN_STATUS.ERROR);
      this.logger.error('Failed to start worker:', error);
    }
  }

  public async stop(): Promise<void> {
    if (this.status === PLUGIN_STATUS.STOPPED || this.status === PLUGIN_STATUS.STOPPING) {
      return;
    }

    this.logger.log('Stopping Frame Worker');
    this.setStatus(PLUGIN_STATUS.STOPPING);

    // If running on a remote worker, remove it from the desired state — the
    // agent converges (stops the child) on the next nudge/heartbeat.
    if (this.isRemote) {
      clearTimeout(this.remoteStartTimeout);
      this.remoteStartTimeout = undefined;
      this.workerManager.clearFrameDecoding(this.camera.id);
      this.isRemote = false;
      await this.channel?.close();
      this.channel = undefined;
      this.setStatus(PLUGIN_STATUS.STOPPED);
      return;
    }

    await this.terminateProcess();
    await this.clearProcessState();
  }

  public async close(): Promise<void> {
    this.logger.trace('Closing Frame Worker');

    this.isClosed = true;
    this.isRestarting = false;
    clearTimeout(this.retryTimeout);
    this.retryTimeout = undefined;
    clearTimeout(this.remoteStartTimeout);
    this.remoteStartTimeout = undefined;

    await this.stop();
    this.unsubscribe();
    await this.channel?.close();
    this.logBuffer = '';
  }

  public async restart(): Promise<void> {
    this.logger.debug('Restarting Frame Worker...');
    this.isRestarting = true;

    await this.stop();
    await sleep(2000);
    await this.start();
  }

  public getPID(): number {
    return this.process?.pid ?? -1;
  }

  private setupEventListeners(): void {
    this.addSubscriptions(
      this.camera
        .onPropertyChange(['name', 'sources', 'detectionSettings', 'ptzAutotrack', 'detectionZones', 'detectionLines', 'frameWorkerSettings', 'interfaceSettings'])
        .subscribe(({ property, newData, oldData }) => {
          if (this.status !== PLUGIN_STATUS.STARTED) {
            return;
          }

          if (property === 'sources') {
            const newSource = (newData as CameraInput[]).map((source) => ({
              name: source.name,
              urls: source.urls,
              role: source.role,
            }));

            const oldSource = (oldData as CameraInput[]).map((source) => ({
              name: source.name,
              urls: source.urls,
              role: source.role,
            }));

            if (isEqual(newSource, oldSource)) {
              return;
            }

            this.restart();
            return;
          }

          if (property === 'name') {
            this.logger.suffix = this.camera.name;
            if (this.status === PLUGIN_STATUS.STARTED) {
              this.frameWorkerChildProxy.updateCameraName(this.camera.name);
            }
            return;
          }

          if (property === 'frameWorkerSettings') {
            this.frameWorkerChildProxy.updateFrameWorkerSettings(newData as CameraFrameWorkerSettings);
            if ((newData as CameraFrameWorkerSettings).fps !== (oldData as CameraFrameWorkerSettings).fps) {
              this.restart();
            }
            return;
          }

          if (property === 'detectionSettings') {
            this.frameWorkerChildProxy.updateDetectionSettings(newData as CameraDetectionSettings);
            return;
          }

          if (property === 'ptzAutotrack') {
            this.frameWorkerChildProxy.updatePtzAutotrackSettings(newData as PtzAutotrackSettings);
            return;
          }

          if (property === 'detectionZones') {
            this.frameWorkerChildProxy.updateZones(newData as DetectionZone[]);
            return;
          }

          if (property === 'detectionLines') {
            this.frameWorkerChildProxy.updateLines(newData as DetectionLine[]);
            return;
          }

          if (property === 'interfaceSettings') {
            this.frameWorkerChildProxy.updateInterfaceSettings(newData as CameraUiSettings);
          }
        }),

      this.camera.onConnected.subscribe((connected) => {
        if (connected) {
          this.start();
        } else {
          this.stop();
        }
      }),
    );
  }

  private startWorkerProcess(): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      try {
        this.setStatus(PLUGIN_STATUS.STARTING);

        this.channel = await this.proxyServer.proxy.privateChannel('frameworker-communication', this.namespaces.frameWorkerChild);
        this.channel.on('message', this.handleWorkerMessage.bind(this, resolve));

        // desireFrameDecoding registers the camera in the master's desired
        // state and returns the agentId, or undefined when delegation is not
        // possible — then we fork locally.
        const agentId = this.workerManager.desireFrameDecoding(this.camera.id);

        if (agentId) {
          this.isRemote = true;
          this.logger.log(`Delegating to remote worker ${agentId}`);
          this.armRemoteFallback();
          return; // resolves once the remote child reports 'started'
        }

        this.isRemote = false;
        this.forkLocal();
      } catch (error) {
        reject(error);
      }
    });
  }

  private forkLocal(): void {
    this.logger.debug('Starting Frame Worker');
    this.logger.trace('Worker path:', nodeDecoderPath);

    const env = this.buildWorkerEnv();
    const processName = 'camera.ui - Frame Worker';

    this.process = fork(nodeDecoderPath, [processName], {
      env: {
        ...process.env,
        ...env,
      },
      silent: true,
      execArgv: IS_DEV && !IS_ELECTRON ? ['--import=tsx'] : undefined,
    });

    this.setupProcessListeners(processName);
  }

  private armRemoteFallback(): void {
    clearTimeout(this.remoteStartTimeout);

    this.remoteStartTimeout = setTimeout(() => {
      if (this.isClosed || !this.isRemote || this.status !== PLUGIN_STATUS.STARTING) {
        return;
      }

      this.logger.warn(`Remote worker did not start the camera within ${REMOTE_START_TIMEOUT_MS / 1000}s — falling back to local`);
      this.workerManager.clearFrameDecoding(this.camera.id);
      this.isRemote = false;

      try {
        this.forkLocal();
      } catch (error) {
        this.setStatus(PLUGIN_STATUS.ERROR);
        this.logger.error('Failed to start local fallback worker:', error);
      }
    }, REMOTE_START_TIMEOUT_MS);
  }

  private async terminateProcess(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.process) {
        this.setStatus(PLUGIN_STATUS.STOPPED);
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        this.logger.warn('Worker did not terminate gracefully. Forcing closure.');
        this.process?.kill('SIGKILL');
        this.setStatus(PLUGIN_STATUS.STOPPED);
        resolve();
      }, 3000);

      this.process.once('exit', (code, signal) => {
        clearTimeout(timeout);
        this.setStatus(PLUGIN_STATUS.STOPPED);
        this.logger.log(`Frame Worker closed. Code: ${code}, Signal: ${signal}`);
        resolve();
      });

      this.process.kill('SIGTERM');
    });
  }

  private setupProcessListeners(processName: string): void {
    if (!this.process) {
      return;
    }

    this.process.once('spawn', () => {
      this.logger.log(`Process started with PID: ${this.process?.pid}`);

      const pid = this.process?.pid;
      if (pid) {
        this.configService.addProcess({
          pid,
          startTime: Date.now(),
          command: process.execPath,
          args: [processName],
          titles: [processName, 'camera.ui - Frame Worker'],
        });
      }
    });

    this.process.once('error', (error) => {
      this.setStatus(PLUGIN_STATUS.ERROR);
      this.logger.error('Process error:', error);
    });

    this.process.once('exit', (code, signal) => {
      const intentional = this.isClosed || isShuttingDown() || this.status === PLUGIN_STATUS.STOPPING || this.status === PLUGIN_STATUS.STOPPED;

      if (intentional) {
        this.logger.log('Frame Worker exited');
      } else {
        this.logger.warn(`Frame Worker exited unexpectedly. Code: ${code}, Signal: ${signal}`);
      }

      this.setStatus(PLUGIN_STATUS.STOPPED);
      this.configService.removeProcessByPID(this.process?.pid);
      this.handleProcessExit();
    });

    this.process.stdout?.on('data', (data) => this.handleLogData(data));
    this.process.stderr?.on('data', (data) => this.handleLogData(data));
  }

  private async handleWorkerMessage(resolve: (value: void | PromiseLike<void>) => void, message: WorkerToMainMessage): Promise<void> {
    if (message.message === 'started') {
      clearTimeout(this.remoteStartTimeout);
      this.remoteStartTimeout = undefined;

      let source = this.getVideoSource();
      let audioSource = this.getAudioSource();
      let snapshotSource = this.getSnapshotSource();
      let availableSources = this.getAvailableSources();

      if (this.isRemote) {
        source = this.rewriteForRemote(source);
        audioSource = this.rewriteForRemote(audioSource);
        snapshotSource = this.rewriteForRemote(snapshotSource);
        availableSources = availableSources.map((s) => ({ ...s, url: this.rewriteForRemote(s.url) }));
      }

      await this.frameWorkerChildProxy.initialize({
        cameraId: this.camera.id,
        streamUrl: source,
        snapshotUrl: snapshotSource,
        audioStreamUrl: audioSource,
        availableSources,
        zones: this.camera.detectionZones,
        lines: this.camera.detectionLines,
        detectionSettings: this.camera.detectionSettings,
        ptzAutotrack: this.camera.ptzAutotrack,
        frameWorkerSettings: this.camera.frameWorkerSettings,
        interfaceSettings: this.camera.interfaceSettings,
      });

      this.setStatus(PLUGIN_STATUS.STARTED);
      this.logger.debug('Frame Worker ready');
      resolve();
    }
  }

  private get frameWorkerChildProxy(): Promisify<FrameWorkerChildInterface> {
    return this.proxyServer.proxy.createProxy<FrameWorkerChildInterface>(this.namespaces.frameWorkerChildRpc);
  }

  private async handleProcessExit(): Promise<void> {
    await this.clearProcessState();
    this.attemptRestart();
  }

  private attemptRestart(): void {
    if (this.isRestarting || this.isClosed || isShuttingDown() || this.status === PLUGIN_STATUS.STOPPING || this.status === PLUGIN_STATUS.STARTING) {
      return;
    }

    this.logger.debug('Attempting restart in 5s...');
    clearTimeout(this.retryTimeout);

    this.retryTimeout = setTimeout(async () => {
      if (this.isRestarting || this.isClosed || isShuttingDown() || this.status === PLUGIN_STATUS.STOPPING || this.status === PLUGIN_STATUS.STARTING) {
        return;
      }

      try {
        this.logger.debug('Executing scheduled restart');
        await this.restart();
      } catch (error) {
        this.logger.error('Failed to restart worker:', error);
      }
    }, 5000);
  }

  private async clearProcessState(): Promise<void> {
    this.process?.removeAllListeners();
    this.process?.stdout?.removeAllListeners();
    this.process?.stderr?.removeAllListeners();
    this.process = undefined;

    await this.channel?.close();
  }

  private setStatus(newStatus: PLUGIN_STATUS): void {
    if (this.status === newStatus) {
      return;
    }

    this._status = newStatus;

    const runtime: WorkerRuntime = {
      [this.camera.name]: {
        name: this.camera.name,
        status: newStatus,
      },
    };

    this.camera.updateFrameWorkerState(newStatus === PLUGIN_STATUS.STARTED);
    this.socketService.io.of('/status').emit('frameworker-process-status', runtime);
  }

  private handleLogData(data: Buffer): void {
    const rawData = data.toString();
    this.logBuffer += rawData;

    const lines = this.logBuffer.split('\n');
    this.logBuffer = lines.pop() ?? '';

    for (const line of lines) {
      this.processLogLine(line);
    }
  }

  private processLogLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed || trimmed.includes('returning true from eof_received')) {
      return;
    }

    const entry = Logger.parseChildLog(trimmed);

    if (entry) {
      this.logManager.handleChildLog(entry);
    } else {
      const rawEntry: LogEntry = {
        timestamp: Date.now(),
        level: 'raw',
        prefix: '',
        message: trimmed,
        targetId: this.camera.id,
        targetType: 'camera',
        source: 'child',
        processId: this.process?.pid,
      };

      this.logManager.handleChildLog(rawEntry);
    }
  }

  private buildWorkerEnv(): Record<string, any> {
    return {
      CAMERA_ID: this.camera.id,
      CAMERA_NAME: this.camera.name,
      PROXY_USER: this.proxyServer.auth.server.user,
      PROXY_PASSWORD: this.proxyServer.auth.server.password,
      PROXY_ENDPOINTS: this.proxyServer.server.endpoints.join(','),
      PROXY_CERT: this.configService.ssl.cert.toString('utf-8'),
      PROXY_KEY: this.configService.ssl.key.toString('utf-8'),
      PROXY_CA: this.configService.ssl.ca.toString('utf-8'),
      LOGGER_LEVEL: this.configService.config.logger.level,
    };
  }

  private rewriteForRemote(url: string): string {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const masterAddress = this.configService.config.workers?.address || '127.0.0.1';
    let rewritten = url.replace(/127\.0\.0\.1|localhost/g, masterAddress);

    const rtsp = this.configService.go2rtcConfig.rtsp;
    if (rtsp.username && rewritten.startsWith('rtsp://')) {
      rewritten = rewritten.replace('rtsp://', `rtsp://${rtsp.username}:${rtsp.password ?? ''}@`);
    }

    return rewritten;
  }

  private getVideoSource(): string {
    const lowRes = this.camera.lowResolutionSource;
    const midRes = this.camera.midResolutionSource;
    const streamSource = this.camera.streamSource;
    const source = lowRes ?? midRes ?? streamSource;

    return source.generateRTSPUrl({
      video: true,
      audio: false,
      gop: false,
      backchannel: false,
      timeout: 10,
    });
  }

  private getAvailableSources(): CoordinatorSourceUrl[] {
    const roleSources = [this.camera.highResolutionSource, this.camera.midResolutionSource, this.camera.lowResolutionSource];
    const result: CoordinatorSourceUrl[] = [];

    for (const source of roleSources) {
      if (!source) continue;
      result.push({
        role: source.role as StreamingRole,
        url: source.generateRTSPUrl({
          video: true,
          audio: false,
          gop: true,
          backchannel: false,
          timeout: 10,
        }),
      });
    }

    return result;
  }

  private getAudioSource(): string {
    const lowRes = this.camera.lowResolutionSource;
    const midRes = this.camera.midResolutionSource;
    const streamSource = this.camera.streamSource;
    const source = lowRes ?? midRes ?? streamSource;

    return source.generateRTSPUrl({
      video: false,
      audio: true,
      gop: false,
      backchannel: false,
      timeout: 10,
    });
  }

  private getSnapshotSource(): string {
    const snapshotSource = this.camera.snapshotSource;
    const lowRes = this.camera.lowResolutionSource;
    const midRes = this.camera.midResolutionSource;
    const streamSource = this.camera.streamSource;
    const source = lowRes ?? midRes ?? streamSource;

    if (snapshotSource) {
      return snapshotSource.generateSnapshotUrl({
        gop: false,
      });
    }

    return source.generateRTSPUrl({
      video: true,
      audio: false,
      gop: false,
      backchannel: false,
      timeout: 10,
    });
  }
}
