import { API_EVENT } from '@camera.ui/sdk';
import { strip } from 'ansicolor';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { container } from 'tsyringe';

import { RemoteService } from '../../api/services/remote.service.js';
import { isShuttingDown } from '../../shutdown-state.js';
import { CloudflareManagedService } from './cloudflare-managed.js';
import { cloudflaredBinaryPath, ensureCloudflaredBinary } from './cloudflaredBinary.js';

import type { Logger } from '@camera.ui/common';
import type { ChildProcess } from 'node:child_process';
import type { Interface } from 'node:readline';
import type { CameraUiAPI } from '../../api.js';
import type { DBCloudflareMode } from '../../api/database/types.js';
import type { ConfigService } from '../../services/config/index.js';

export class CloudflareService {
  public readonly managed: CloudflareManagedService;

  private api: CameraUiAPI;
  private configService: ConfigService;
  private remoteService: RemoteService;

  private cloudflareUrl: string | null = null;
  private cloudflarePath: string;
  private cloudflaredProcess?: ChildProcess;
  private currentArgs: string[] = [];

  private shuttingDown = false;
  private manuallyKilled = false;

  private reconnectTimer?: NodeJS.Timeout;

  private installPromise?: Promise<string>;

  private stdoutLine?: Interface;
  private stderrLine?: Interface;

  constructor(
    private logger: Logger,
    private onUrlDetected?: (url: string) => void,
  ) {
    this.api = container.resolve<CameraUiAPI>('api');
    this.configService = container.resolve<ConfigService>('configService');
    this.remoteService = new RemoteService();
    this.managed = new CloudflareManagedService(logger);

    const configDir = this.configService.STORAGE_PATH;
    this.cloudflarePath = join(configDir, '.cloudflare');
    mkdirSync(this.cloudflarePath, { recursive: true });

    this.api.setMaxListeners(this.api.getMaxListeners() + 1);
    this.api.once(API_EVENT.SHUTDOWN, () => {
      this.shuttingDown = true;
      this.stop();
    });
  }

  public get url(): string | null {
    return this.cloudflareUrl ?? this.managed.runningUrl;
  }

  public get isRunning(): boolean {
    return !!this.cloudflaredProcess || this.managed.runningUrl !== null;
  }

  public async start(): Promise<void> {
    try {
      await this.ensureCloudflaredInstalled();

      this.stop();
      this.manuallyKilled = false;

      const config = this.remoteService.info().cloudflare;
      const mode: DBCloudflareMode = config?.mode ?? 'quick';
      switch (mode) {
        case 'quick':
          this.startQuickTunnel();
          return;
        case 'token':
          if (!config?.token || !config?.hostname) {
            this.logger.warn('Cloudflare: Token mode requires both token and hostname — falling back to Quick Tunnel.');
            this.startQuickTunnel();
            return;
          }
          this.startTokenTunnel(config.token, config.hostname);
          return;
        case 'managed':
          this.cloudflareUrl = config?.hostname ? `https://${config.hostname}` : null;
          if (this.cloudflareUrl) this.onUrlDetected?.(this.cloudflareUrl);
          await this.managed.resumeIfReady();
          return;
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  public async startQuick(): Promise<void> {
    try {
      await this.ensureCloudflaredInstalled();
      this.stop();
      this.manuallyKilled = false;
      this.startQuickTunnel();
    } catch (error) {
      this.handleError(error);
    }
  }

  public stop(): void {
    this.manuallyKilled = true;
    this.managed.stop();
    this.reset();
  }

  private async ensureCloudflaredInstalled(): Promise<void> {
    if (this.isCloudflaredInstalled()) return;
    if (this.installPromise) {
      await this.installPromise;
      return;
    }
    this.logger.debug('Cloudflare: Installing cloudflared...');
    this.installPromise = ensureCloudflaredBinary(this.cloudflarePath);
    try {
      await this.installPromise;
    } finally {
      this.installPromise = undefined;
    }
  }

  private reset(): void {
    this.stdoutLine?.close();
    this.stdoutLine = undefined;

    this.stderrLine?.close();
    this.stderrLine = undefined;

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;

    this.cloudflaredProcess?.kill('SIGKILL');
    this.cloudflaredProcess = undefined;

    this.cloudflareUrl = null;
    this.currentArgs = [];
  }

  private startQuickTunnel(): void {
    const args = ['tunnel', '--url', `https://127.0.0.1:${this.configService.config.port}`, '--no-autoupdate', '--no-tls-verify'];
    this.spawnCloudflared(args);
  }

  private startTokenTunnel(token: string, hostname: string): void {
    this.cloudflareUrl = `https://${hostname}`;
    this.onUrlDetected?.(this.cloudflareUrl);
    const args = ['tunnel', '--no-autoupdate', 'run', '--token', token];
    this.spawnCloudflared(args);
  }

  private spawnCloudflared(args: string[]): void {
    this.currentArgs = args;
    const binPath = this.cloudflaredBinaryPath();

    this.cloudflaredProcess = spawn(binPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.setupProcessHandlers();
  }

  private setupProcessHandlers(): void {
    if (!this.cloudflaredProcess) return;

    const proc = this.cloudflaredProcess;
    const cloudflaredPID = proc.pid;

    if (cloudflaredPID) {
      this.configService.addProcess({
        pid: cloudflaredPID,
        startTime: Date.now(),
        command: this.cloudflaredBinaryPath(),
        args: this.currentArgs,
      });
    }

    proc.on('error', (error) => {
      if (cloudflaredPID) {
        this.configService.removeProcessByPID(cloudflaredPID);
      }

      if (this.cloudflaredProcess !== proc || isShuttingDown()) return;
      this.handleError(error);
    });

    proc.on('exit', (code) => {
      if (cloudflaredPID) {
        this.configService.removeProcessByPID(cloudflaredPID);
      }

      if (this.cloudflaredProcess !== proc || isShuttingDown()) return;

      this.handleError(new Error(`Process exited unexpectedly with code ${code}`));
    });

    this.stdoutLine = createInterface({
      input: this.cloudflaredProcess.stdout!,
      terminal: false,
    });

    this.stderrLine = createInterface({
      input: this.cloudflaredProcess.stderr!,
      terminal: false,
    });

    this.stdoutLine.on('line', this.processLogger.bind(this));
    this.stderrLine.on('line', this.processLogger.bind(this));
  }

  private handleError(error: any): void {
    if (!this.shuttingDown && !this.manuallyKilled) {
      this.logger.error('Cloudflare:', error?.message ?? error);

      this.reset();

      this.reconnectTimer = setTimeout(() => {
        if (this.shuttingDown || this.manuallyKilled) {
          return;
        }

        this.start();
      }, 5000);
    }
  }

  private processLogger(line: string): void {
    const blankLine = strip(line.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z?\s*/, ''));

    this.analyzeLogLine(blankLine);

    if (blankLine.includes('WRN') && !this.shuttingDown && !this.manuallyKilled) {
      this.logger.warn(blankLine);
    } else if (
      (blankLine.includes('FTL') || blankLine.includes('ERR') || (!blankLine.includes('DBG') && blankLine.toLowerCase().includes('error'))) &&
      !this.shuttingDown &&
      !this.manuallyKilled
    ) {
      this.logger.error(blankLine);
    } else if (!blankLine.includes('exit with signal')) {
      this.logger.trace(blankLine);
    }
  }

  private analyzeLogLine(line: string): void {
    const match = /(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/.exec(line);
    if (match && !this.cloudflareUrl) {
      this.logger.log('Cloudflare URL detected:', match[1]);
      this.cloudflareUrl = match[1];
      this.onUrlDetected?.(match[1]);
    }
  }

  private cloudflaredBinaryPath(): string {
    return cloudflaredBinaryPath(this.cloudflarePath);
  }

  private isCloudflaredInstalled(): boolean {
    return existsSync(this.cloudflaredBinaryPath());
  }
}
