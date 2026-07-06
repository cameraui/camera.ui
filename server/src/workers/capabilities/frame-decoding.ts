import { Logger } from '@camera.ui/common/logger';
import { sleep } from '@camera.ui/common/utils';
import { fork } from 'node:child_process';

import { nodeDecoderPath } from '../../utils/path.js';
import { WorkerCapability } from '../types.js';

import type { LogEntry } from '@camera.ui/common/logger';
import type { ChildProcess } from 'node:child_process';
import type { NATS } from '../../rpc/server.js';
import type { ConfigService } from '../../services/config/index.js';
import type { RemoteCameraConfig } from '../types.js';
import type { CapabilityHandler } from './handler.js';

interface ManagedCamera {
  cameraId: string;
  frameWorkerProcess?: ChildProcess;
  config: RemoteCameraConfig;
  logBuffer: string;
}

export class FrameDecodingHandler implements CapabilityHandler<WorkerCapability.FrameDecoding> {
  public readonly capability = WorkerCapability.FrameDecoding;

  private cameras = new Map<string, ManagedCamera>();
  private restartTimers = new Map<string, NodeJS.Timeout>();
  private isClosed = false;

  constructor(
    private readonly natsServer: NATS,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
    private readonly forwardLog?: (entry: LogEntry) => void,
  ) {}

  public async start(id: string, spec: RemoteCameraConfig): Promise<void> {
    this.logger.log(`Starting camera: ${spec.cameraName} (${id})`);

    if (this.cameras.has(id)) {
      await this.stop(id);
      await sleep(1000);
    }

    const managed: ManagedCamera = {
      cameraId: id,
      config: spec,
      logBuffer: '',
    };

    this.cameras.set(id, managed);

    try {
      managed.frameWorkerProcess = this.forkFrameWorker(spec);
    } catch (error: any) {
      this.logger.error(`Failed to fork FrameWorker for ${spec.cameraName}:`, error);
      await this.stop(id);
      throw error;
    }
  }

  public async stop(id: string): Promise<void> {
    const managed = this.cameras.get(id);
    if (!managed) {
      return;
    }

    this.logger.log(`Stopping camera: ${managed.config.cameraName} (${id})`);

    this.cameras.delete(id);

    const restartTimer = this.restartTimers.get(id);
    if (restartTimer) {
      clearTimeout(restartTimer);
      this.restartTimers.delete(id);
    }

    if (managed.frameWorkerProcess) {
      await this.killProcess(managed.frameWorkerProcess);
      managed.frameWorkerProcess = undefined;
    }
  }

  public async stopAll(): Promise<void> {
    this.isClosed = true;

    for (const timer of this.restartTimers.values()) {
      clearTimeout(timer);
    }
    this.restartTimers.clear();

    const stopPromises = Array.from(this.cameras.keys()).map((id) => this.stop(id));
    await Promise.allSettled(stopPromises);
  }

  public getActiveWorkIds(): string[] {
    return Array.from(this.cameras.keys());
  }

  public getActiveProcessIds(): number[] {
    const pids: number[] = [];
    for (const managed of this.cameras.values()) {
      const pid = managed.frameWorkerProcess?.pid;
      if (pid) {
        pids.push(pid);
      }
    }
    return pids;
  }

  private forkFrameWorker(config: RemoteCameraConfig): ChildProcess {
    const proxyAuth = this.natsServer.localAuth;
    const processName = 'camera.ui - Frame Worker (remote)';

    const env: Record<string, string> = {
      CAMERA_ID: config.cameraId,
      CAMERA_NAME: config.cameraName,
      PROXY_USER: proxyAuth.user,
      PROXY_PASSWORD: proxyAuth.password,
      PROXY_ENDPOINTS: this.natsServer.endpoints.join(','),
      PROXY_CERT: this.configService.ssl.cert.toString('utf-8'),
      PROXY_KEY: this.configService.ssl.key.toString('utf-8'),
      PROXY_CA: this.configService.ssl.ca.toString('utf-8'),
      LOGGER_LEVEL: config.loggerLevel,
    };

    this.logger.debug(`Forking FrameWorker for ${config.cameraName}`);

    const child = fork(nodeDecoderPath, [processName], {
      env: { ...process.env, ...env },
      silent: true,
    });

    child.once('spawn', () => {
      this.logger.log(`FrameWorker for ${config.cameraName} started with PID: ${child.pid}`);
      if (child.pid) {
        this.configService.addProcess({
          pid: child.pid,
          startTime: Date.now(),
          command: process.execPath,
          args: [processName],
          titles: [processName],
        });
      }
    });

    child.once('exit', (code, signal) => {
      this.logger.warn(`FrameWorker for ${config.cameraName} exited (code: ${code}, signal: ${signal})`);
      this.configService.removeProcessByPID(child.pid);

      const managed = this.cameras.get(config.cameraId);
      if (managed) {
        managed.frameWorkerProcess = undefined;
      }

      this.attemptRestart(config);
    });

    child.stdout?.on('data', (data: Buffer) => {
      this.handleChildOutput(data, config, child.pid);
    });
    child.stderr?.on('data', (data: Buffer) => {
      this.handleChildOutput(data, config, child.pid);
    });

    return child;
  }

  private async killProcess(child: ChildProcess): Promise<void> {
    return new Promise((resolve) => {
      if (!child.connected && child.exitCode !== null) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 3000);

      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      child.kill('SIGTERM');
    });
  }

  private attemptRestart(config: RemoteCameraConfig): void {
    if (this.isClosed) {
      return;
    }

    const managed = this.cameras.get(config.cameraId);
    if (!managed) {
      return;
    }

    const existingTimer = this.restartTimers.get(config.cameraId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    this.logger.log(`Scheduling FrameWorker restart for ${config.cameraName} in 5s`);

    const timer = setTimeout(async () => {
      this.restartTimers.delete(config.cameraId);

      if (this.isClosed) {
        return;
      }

      const current = this.cameras.get(config.cameraId);
      if (!current) {
        return;
      }

      if (current.frameWorkerProcess) {
        return;
      }

      try {
        this.logger.log(`Restarting FrameWorker for ${config.cameraName}`);
        current.frameWorkerProcess = this.forkFrameWorker(config);
      } catch (error: any) {
        this.logger.error(`Failed to restart FrameWorker for ${config.cameraName}:`, error);
        // Remove camera so heartbeat reflects reality
        this.cameras.delete(config.cameraId);
      }
    }, 5000);

    this.restartTimers.set(config.cameraId, timer);
  }

  private handleChildOutput(data: Buffer, config: RemoteCameraConfig, pid?: number): void {
    const managed = this.cameras.get(config.cameraId);
    if (!managed) {
      return;
    }

    managed.logBuffer += data.toString();

    const lines = managed.logBuffer.split('\n');
    managed.logBuffer = lines.pop() ?? '';

    for (const line of lines) {
      this.processLogLine(line, config, pid);
    }
  }

  private processLogLine(line: string, config: RemoteCameraConfig, pid?: number): void {
    const trimmed = line.trim();
    if (!trimmed || trimmed.includes('returning true from eof_received')) {
      return;
    }

    this.logger.trace(`[${config.cameraName}] ${trimmed}`);

    const entry: LogEntry = Logger.parseChildLog(trimmed) ?? {
      timestamp: Date.now(),
      level: 'raw',
      prefix: '',
      message: trimmed,
      targetId: config.cameraId,
      targetType: 'camera',
      source: 'child',
      processId: pid,
    };

    this.forwardLog?.(entry);
  }
}
