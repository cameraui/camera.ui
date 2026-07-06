import { sleep } from '@camera.ui/common/utils';
import { API_EVENT } from '@camera.ui/sdk';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { container } from 'tsyringe';

import { RemoteService } from '../../api/services/remote.service.js';
import { PROXY_TUNNEL_ENDPOINT } from '../../services/config/constants.js';
import { RUNTIME_STATUS } from '../../services/config/types.js';
import { isShuttingDown } from '../../shutdown-state.js';
import { NotAuthorizedError } from '../api/credentialStore.js';

import type { Logger } from '@camera.ui/common/logger';
import type { ChildProcess } from 'node:child_process';
import type { Interface } from 'node:readline';
import type { CameraUiAPI } from '../../api.js';
import type { Server } from '../../api/index.js';
import type { SocketService } from '../../api/websocket/index.js';
import type { ServerRuntime } from '../../api/websocket/types.js';
import type { ProxyServer } from '../../rpc/index.js';
import type { ConfigService } from '../../services/config/index.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { CloudApi } from '../api/index.js';

const TUNNEL_CREDENTIALS_SUBJECT = 'tunnel.server.credentials';

const BASE_RESTART_DELAY_MS = 1_000;
const MAX_RESTART_DELAY_MS = 60_000;
const HEALTHY_RUN_MS = 60_000;

export class TunnelClient {
  public version = 'unknown';
  public os = 'unknown';

  protected proxyServer: ProxyServer;

  private tunnelClientProcess?: ChildProcess;

  private api: CameraUiAPI;
  private logger: Logger;
  private configService: ConfigService;
  private remoteService: RemoteService;
  private cloudApi: CloudApi;

  private credentialsUnsub?: () => void;

  private started = false;
  private restarting = false;
  private manuallyKilled = false;
  private shuttingDown = false;
  private pausedForReauth = false;

  private restartAttempts = 0;
  private lastSpawnAt = 0;

  private stdoutLine?: Interface;
  private stderrLine?: Interface;

  private _status: RUNTIME_STATUS = RUNTIME_STATUS.UNKNOWN;

  public get status(): RUNTIME_STATUS {
    return this._status;
  }

  public get isRunning(): boolean {
    return this.started;
  }

  constructor() {
    container.registerInstance('tunnelClient', this);

    this.api = container.resolve<CameraUiAPI>('api');
    this.configService = container.resolve<ConfigService>('configService');
    this.proxyServer = container.resolve<ProxyServer>('proxy');
    this.cloudApi = container.resolve<CloudApi>('cloudApi');

    const loggerService = container.resolve<LoggerService>('logger');
    this.logger = loggerService.createSystemLogger('Tunnel Client', 'tunnel');

    this.remoteService = new RemoteService();

    this.api.setMaxListeners(this.api.getMaxListeners() + 1);
    this.api.once(API_EVENT.SHUTDOWN, () => {
      this.shuttingDown = true;
      this.stop();
    });
  }

  public async start(): Promise<void> {
    if (this.started) {
      this.logger.warn('Tunnel Client already running!');
      return;
    }

    const oauth = this.remoteService.getCloud().oauth;
    if (!oauth) {
      this.logger.debug('Tunnel Client skipped: server not registered');
      this.setStatus(RUNTIME_STATUS.STOPPED);
      return;
    }
    if (oauth.needs_reauth) {
      this.logger.debug('Tunnel Client skipped: cloud session needs re-authentication');
      this.setStatus(RUNTIME_STATUS.STOPPED);
      return;
    }

    this.pausedForReauth = false;

    const command = this.configService.TUNNEL_BINARY;

    this.logger.debug('Starting Tunnel Client...');

    await this.registerCredentialsResponder();

    this.started = true;
    this.manuallyKilled = false;
    this.setStatus(RUNTIME_STATUS.STARTING);

    return new Promise((resolve, reject) => {
      this.tunnelClientProcess = spawn(command, [], {
        env: Object.assign(
          {
            TUNNEL_ENDPOINT: PROXY_TUNNEL_ENDPOINT,
            LOCAL_PORT: String(this.getInternalPort()),
            NATS_USER: this.proxyServer.auth.server.user,
            NATS_PASSWORD: this.proxyServer.auth.server.password,
            NATS_ENDPOINTS: this.proxyServer.server.endpoints.join(','),
          },
          process.env,
        ),
        cwd: '.',
        stdio: 'pipe',
      });

      let tunnelPid: number | undefined = undefined;

      this.tunnelClientProcess.on('spawn', async () => {
        this.logger.log(`Initializing process with PID: ${this.tunnelClientProcess?.pid}`);

        this.lastSpawnAt = Date.now();
        tunnelPid = this.tunnelClientProcess?.pid;

        if (tunnelPid) {
          this.configService.addProcess({
            pid: tunnelPid,
            startTime: Date.now(),
            command,
            args: [],
          });
        }

        await sleep(1000);

        this.setStatus(RUNTIME_STATUS.STARTED);

        resolve();
      });

      this.tunnelClientProcess.on('error', (error: Error) => {
        this.started = false;

        this.logger.error('The Tunnel Client process failed to start/stop!', error);

        this.setStatus(RUNTIME_STATUS.ERROR);

        reject(error);
      });

      this.tunnelClientProcess.on('exit', async () => {
        this.configService.removeProcessByPID(tunnelPid);

        setTimeout(() => {
          this.started = false;

          this.setStatus(RUNTIME_STATUS.STOPPED);
          this.handleClose();

          resolve();
        }, 100);
      });

      this.stdoutLine = createInterface({
        input: this.tunnelClientProcess.stdout!,
        terminal: false,
      });

      this.stderrLine = createInterface({
        input: this.tunnelClientProcess.stderr!,
        terminal: false,
      });

      this.stdoutLine.on('line', this.processLogger.bind(this));
      this.stderrLine.on('line', this.processLogger.bind(this));
    });
  }

  public async stop(): Promise<void> {
    this.logger.log('Stopping Tunnel Client...');
    this.manuallyKilled = true;
    this.credentialsUnsub?.();
    this.credentialsUnsub = undefined;
    this.stdoutLine?.close();
    this.stderrLine?.close();
    await this.kill();
  }

  private async registerCredentialsResponder(): Promise<void> {
    if (this.credentialsUnsub) {
      return;
    }
    this.credentialsUnsub = await this.proxyServer.proxy.onRequest(TUNNEL_CREDENTIALS_SUBJECT, async () => {
      try {
        const token = await this.cloudApi.credentialStore.getAccessToken(['tunnel:connect']);
        return { success: true, data: token };
      } catch (error) {
        if (error instanceof NotAuthorizedError) {
          this.pauseForReauth();
        }
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
  }

  public async restart(): Promise<void> {
    this.restarting = true;

    await this.stop();
    await sleep(1000);
    await this.start();

    this.restarting = false;
  }

  public getPID(): number {
    return this.tunnelClientProcess?.pid ?? 0;
  }

  private getInternalPort(): number {
    const server = container.resolve<Server>('server');
    const port = server.internalPort;
    if (!port) {
      throw new Error('Tunnel Client: internal listener port not ready — server.listen() must run first');
    }
    return port;
  }

  private async kill(): Promise<void> {
    return new Promise((resolve) => {
      const res = (): void => {
        clearTimeout(killTimeout);
        resolve();
      };

      this.tunnelClientProcess?.once('exit', () => {
        res();
      });

      this.tunnelClientProcess?.kill('SIGKILL');

      const killTimeout = setTimeout(() => res(), 3000);
    });
  }

  private handleClose(): void {
    if (this.shuttingDown || this.manuallyKilled || this.pausedForReauth || isShuttingDown()) {
      return;
    }

    const ranFor = this.lastSpawnAt ? Date.now() - this.lastSpawnAt : 0;
    if (ranFor > HEALTHY_RUN_MS) {
      this.restartAttempts = 0;
    }
    const delay = Math.min(BASE_RESTART_DELAY_MS * 2 ** this.restartAttempts, MAX_RESTART_DELAY_MS);
    this.restartAttempts++;

    this.logger.log(`Restarting Tunnel Client in ${Math.round(delay / 1000)}s...`);

    setTimeout(() => {
      if (this.shuttingDown || this.manuallyKilled || this.pausedForReauth || isShuttingDown()) {
        this.logger.log('Cancelled restart!');
        return;
      }

      this.start();
    }, delay);
  }

  private async pauseForReauth(): Promise<void> {
    if (this.pausedForReauth) {
      return;
    }
    this.pausedForReauth = true;
    this.logger.warn('Cloud session revoked — tunnel paused until re-authentication under Settings → Remote');
    this.setStatus(RUNTIME_STATUS.STOPPED);
    await this.kill();
    this.started = false;
  }

  private setStatus(status: RUNTIME_STATUS): void {
    this._status = status;

    const socketService = container.resolve<SocketService>('socketService');

    const runtimeInfo: ServerRuntime = {
      tunnelClient: { name: 'tunnelClient', status: status },
    };

    socketService.io?.of('/status').emit('process-status', runtimeInfo);
  }

  private processLogger(line: string): void {
    if (line.includes('FTL') || line.includes('ERR') || (!line.includes('DBG') && /error/i.test(line))) {
      this.logger.error(line);
    } else if (line.includes('WRN')) {
      this.logger.warn(line);
    } else {
      this.logger.debug(line);
    }
  }
}
