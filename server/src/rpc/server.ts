import { IS_DEV, sleep } from '@camera.ui/common/utils';
import { strip } from 'ansicolor';
import getPort from 'get-port';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { container } from 'tsyringe';

import { RUNTIME_STATUS } from '../services/config/types.js';
import { isShuttingDown } from '../shutdown-state.js';

import type { Logger } from '@camera.ui/common/logger';
import type { ChildProcess } from 'node:child_process';
import type { Interface } from 'node:readline';
import type { SocketService } from '../api/websocket/index.js';
import type { ServerRuntime } from '../api/websocket/types.js';
import type { ConfigService } from '../services/config/index.js';
import type { LoggerService } from '../services/logger/index.js';
import type { AuthConfig, NatsConfig, ProxyAuth } from './interfaces/config.js';

const SERVER_READY_MESSAGE = 'Server is ready';
const SERVER_ERROR_MESSAGE = 'Error listening on port';

export interface LeafNodeConfig {
  enabled: boolean;
  host: string;
  port: number;
  users: { user: string; password: string }[];
  tlsCertFile: string;
  tlsKeyFile: string;
}

export interface LeafNodeRemoteConfig {
  url: string;
  caFile: string;
}

export class NATS {
  private readonly clusterAmount = 0;

  private _serverPort!: number;
  private _clusterPort!: number;
  private _wsPort!: number;
  private _leafAcceptorPort!: number;
  private _leafAcceptorClusterPort!: number;
  private _endpoints: string[] = [];
  private leafNodeConfig?: LeafNodeConfig;
  private leafNodeRemotes?: LeafNodeRemoteConfig[];

  private serverProcess?: ChildProcess;
  private clusterProcesses: ChildProcess[] = [];

  private leafAcceptorProcess?: ChildProcess;
  private restartingLeafAcceptor = false;
  private clusterListenerEnabled = false;

  private logger: Logger;
  private configService: ConfigService;

  private tmpDir: string;
  private config: NatsConfig;

  private manuallyKilled = false;

  private stdoutLine?: Interface;
  private stderrLine?: Interface;

  private _status: RUNTIME_STATUS = RUNTIME_STATUS.UNKNOWN;

  constructor(
    private readonly auth: ProxyAuth,
    options?: { serverName?: string },
  ) {
    container.registerInstance('natsServer', this);

    this.configService = container.resolve<ConfigService>('configService');

    const loggerService = container.resolve<LoggerService>('logger');
    this.logger = loggerService.createSystemLogger('Nats', 'nats');

    this.tmpDir = mkdtempSync(join(this.configService.TMP_PATH, 'nats-'));

    // const tlsConfig: NatsTLSConfig = {
    //   cert_file: this.configService.config.ssl.certFile,
    //   key_file: this.configService.config.ssl.keyFile,
    //   ca_file: this.configService.config.ssl.caFile,
    //   timeout: 5,
    // };

    this.config = {
      host: 'localhost',
      port: 0,
      server_name: options?.serverName ?? 'camera.ui-server',
      // tls: tlsConfig,
      authorization: {
        timeout: 5,
        users: [
          { user: this.auth.server.user, password: this.auth.server.password },
          {
            user: this.auth.viewer.user,
            password: this.auth.viewer.password,
            permissions: {
              publish: {
                allow: [
                  // RPC client-library control frames (callback/stream/iterator).
                  'rpc.cb.>',
                  'stream.rpc.>',
                  '_rpc.iterator.>',

                  // coreManager — read-only metadata
                  'rpc.coreManager.rpc.>',

                  // deviceManager — sanitized camera lookup
                  'rpc.deviceManager.rpc.getCamera',

                  // Camera controller — view/playback reads only
                  'rpc.camera.*.controller.rpc.snapshot',
                  'rpc.camera.*.controller.rpc.probeStream',
                  'rpc.camera.*.controller.rpc.streamUrl',
                  'rpc.camera.*.controller.rpc.refreshStates',

                  // Sensor controller — state reads only
                  'rpc.camera.*.sensors.rpc.getSensors',
                  'rpc.camera.*.sensors.rpc.getSensorStates',

                  // NVR specific — read-only access
                  'rpc.plugin.*.child.rpc.getEvents',
                  'rpc.plugin.*.child.rpc.getCameraEvents',
                  'rpc.plugin.*.child.rpc.getEventThumbnails',
                  'rpc.plugin.*.child.rpc.getDetectionHeatmap',
                  'rpc.plugin.*.child.rpc.getRecordingDays',
                  'rpc.plugin.*.child.rpc.getRecordingSegments',
                  'rpc.plugin.*.child.rpc.getManagedCameraIds',
                  'rpc.plugin.*.child.rpc.getSystemEvents',
                  'rpc.plugin.*.child.rpc.onRecordingState',
                  'rpc.plugin.*.child.rpc.onSystemEvent',
                  'rpc.plugin.*.child.rpc.nvrScrub',
                  'rpc.plugin.*.child.rpc.nvrPlayback',
                  'rpc.plugin.*.child.rpc.nvrPlaybackCmd',
                  'rpc.plugin.*.child.rpc.nvrPreviewFrames',
                  'rpc.plugin.*.child.rpc.nvrExport',
                  'rpc.plugin.*.child.rpc.nvrExportBatch',
                  'rpc.plugin.*.child.rpc.nvrExportEstimate',
                  'rpc.plugin.*.child.rpc.searchEventsByText',
                ],
              },
            },
          },
        ],
      },
      // max_pending: 6 * 1024 * 1024, // 6MB
      // 4MB: keeps snapshots/thumbnail batches out of the chunking path.
      max_payload: 4 * 1024 * 1024,
      max_control_line: 4096, // 4KB — fits any subject + headers + reply-to
      // Explicit (matches the NATS default): bounds a dead browser socket.
      write_deadline: '10s',
      // no_fast_producer_stall: false,
    };

    if (this.clusterAmount > 0) {
      this.config.cluster = {
        name: 'camera.ui-cluster',
        host: 'localhost',
        port: 0,
        routes: [],
        authorization: {
          timeout: 5,
          ...this.auth.cluster,
        },
        // tls: tlsConfig,
      };
    }
  }

  get status(): RUNTIME_STATUS {
    return this._status;
  }

  get endpoints(): string[] {
    return this._endpoints;
  }

  get serverPort(): number {
    return this._serverPort;
  }

  get clusterPort(): number {
    return this._clusterPort;
  }

  get wsPort(): number {
    return this._wsPort;
  }

  get localAuth(): AuthConfig {
    return this.auth.server;
  }

  public setLeafNodeConfig(config: LeafNodeConfig): void {
    this.leafNodeConfig = config;
  }

  public setClusterListenerEnabled(enabled: boolean): void {
    this.clusterListenerEnabled = enabled;
  }

  public setLeafNodeRemotes(remotes: LeafNodeRemoteConfig[]): void {
    this.leafNodeRemotes = remotes;
  }

  public async start(): Promise<void> {
    this.manuallyKilled = false;

    this.setStatus(RUNTIME_STATUS.STARTING);

    await this.configServer();

    this.setStatus(RUNTIME_STATUS.STARTED);

    await this.configClusters();

    this.logger.debug('Nats server started and cluster formed!');
    this.logger.log(`Nats server is running on port ${this._serverPort}`);
  }

  private async configServer(): Promise<void> {
    this._serverPort ||= await getPort({ host: 'localhost', ipv6Only: false });
    this._clusterPort ||= await getPort({ host: 'localhost', ipv6Only: false });
    this._wsPort ||= await getPort({ host: 'localhost', ipv6Only: false });

    this._endpoints = [`nats://localhost:${this._serverPort}`];

    const config: NatsConfig = {
      ...this.config,
      port: this._serverPort,
      websocket: {
        host: 'localhost',
        port: this.wsPort,
        no_tls: false,
        tls: {
          cert_file: this.configService.config.ssl.certFile,
          key_file: this.configService.config.ssl.keyFile,
        },
      },
    };

    if (this.clusterListenerEnabled) {
      this._leafAcceptorPort ||= await getPort({ host: 'localhost', ipv6Only: false });
      config.cluster = {
        name: 'camera.ui-cluster',
        host: 'localhost',
        port: this._clusterPort,
        routes: [],
        authorization: { timeout: 5, ...this.auth.cluster },
      };
    } else if (this.clusterAmount > 0) {
      config.cluster = {
        ...this.config.cluster!,
        port: this._clusterPort,
      };
    }

    if (IS_DEV) {
      config.http = await getPort({ host: 'localhost', ipv6Only: false });
    }

    // Worker mode: connect outwards to the master, pinned to its CA.
    if (this.leafNodeRemotes?.length) {
      (config as any).leafnodes = {
        remotes: this.leafNodeRemotes.map((remote) => ({
          url: remote.url,
          tls: {
            ca_file: remote.caFile,
          },
        })),
      };
    }

    const serverConfig = await this.writeConfigFile(config, 'server');
    await this.startServer(serverConfig);

    // Bring up the leaf-acceptor once the main server (its cluster peer) is up.
    if (this.leafNodeConfig?.enabled && this.leafNodeConfig.users.length > 0) {
      await this.startLeafAcceptor();
    }
  }

  private async buildLeafAcceptorConfig(): Promise<NatsConfig> {
    const leaf = this.leafNodeConfig!;

    this._leafAcceptorClusterPort ||= await getPort({ host: 'localhost', ipv6Only: false });

    const config: NatsConfig = {
      host: 'localhost',
      port: this._leafAcceptorPort,
      server_name: 'camera.ui-leaf-acceptor',
      authorization: this.config.authorization,
      cluster: {
        name: 'camera.ui-cluster',
        host: 'localhost',
        port: this._leafAcceptorClusterPort,
        routes: [`nats://${this.auth.cluster.user}:${this.auth.cluster.password}@localhost:${this._clusterPort}`],
        authorization: { timeout: 5, ...this.auth.cluster },
      },
    };

    (config as any).leafnodes = {
      host: leaf.host,
      port: leaf.port,
      tls: {
        cert_file: leaf.tlsCertFile,
        key_file: leaf.tlsKeyFile,
      },
      authorization: {
        users: leaf.users.map((user) => ({ user: user.user, password: user.password })),
      },
    };

    return config;
  }

  private async configClusters(): Promise<void> {
    if (!this.config.cluster) {
      return;
    }

    for (let i = 0; i < this.clusterAmount; i++) {
      const _clusterPort = await getPort({ host: 'localhost', ipv6Only: false });
      this._endpoints.push(`nats://localhost:${_clusterPort}`);

      const config = {
        ...this.config,
        server_name: `camera.ui-cluster-${i}`,
        port: _clusterPort,
        cluster: {
          ...this.config.cluster,
          port: await getPort({ host: 'localhost', ipv6Only: false }),
          routes: [`nats://${this.config.cluster.authorization.user}:${this.config.cluster.authorization.password}@localhost:${this._clusterPort}`],
        },
      };

      const clusterConfig = await this.writeConfigFile(config, `cluster-${i}`);
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 100)); // wait for port
      await this.startClusterServer(clusterConfig);
    }
  }

  public async stop(): Promise<void> {
    this.manuallyKilled = true;

    this.logger.log('Stopping Nats server and cluster...');

    const promises = this.clusterProcesses.map((process) => this.kill(process));

    if (this.leafAcceptorProcess) {
      this.restartingLeafAcceptor = true; // suppress auto-restart
      promises.push(this.kill(this.leafAcceptorProcess));
    }

    if (this.serverProcess) {
      promises.push(this.kill(this.serverProcess));
    }

    await Promise.all(promises);
    this.leafAcceptorProcess = undefined;

    this.stdoutLine?.close();
    this.stderrLine?.close();
  }

  public async reconcileLeafAcceptor(): Promise<void> {
    const shouldRun = !!this.leafNodeConfig?.enabled && this.leafNodeConfig.users.length > 0;

    if (!shouldRun) {
      if (this.leafAcceptorProcess) {
        this.logger.log('Stopping leaf-acceptor (no paired workers)');
        this.restartingLeafAcceptor = true;
        await this.kill(this.leafAcceptorProcess);
        this.leafAcceptorProcess = undefined;
        this.restartingLeafAcceptor = false;
      }
      return;
    }

    if (this.leafAcceptorProcess) {
      this.logger.log('Restarting leaf-acceptor to apply worker credential change');
      this.restartingLeafAcceptor = true;
      await this.kill(this.leafAcceptorProcess);
      this.leafAcceptorProcess = undefined;
    }

    await this.startLeafAcceptor();
    this.restartingLeafAcceptor = false;
  }

  public async restart(): Promise<void> {
    this.setStatus(RUNTIME_STATUS.RESTARTING);

    await this.stop();
    await sleep(1000);
    await this.start();
  }

  public getPID(): number {
    return this.serverProcess?.pid ?? 0;
  }

  private async startServer(configFile: string): Promise<void> {
    const args = ['-config', configFile];

    this.logger.debug(`Starting Nats server with following command: ${this.configService.NATS_BINARY} ${args.join(' ')}`);

    await new Promise<void>((resolve, reject) => {
      this.serverProcess = spawn(this.configService.NATS_BINARY, args);
      this.setupProcess(this.serverProcess, args, configFile, 'server', resolve, reject);
    });
  }

  private async startClusterServer(configFile: string): Promise<void> {
    const args = ['-config', configFile];

    this.logger.debug(`Starting Nats cluster server with following command: ${this.configService.NATS_BINARY} ${args.join(' ')}`);

    await new Promise<void>((resolve, reject) => {
      const clusterProcess = spawn(this.configService.NATS_BINARY, args);
      this.setupProcess(clusterProcess, args, configFile, 'cluster', resolve, reject);
      this.clusterProcesses.push(clusterProcess);
    });
  }

  private async startLeafAcceptor(): Promise<void> {
    const config = await this.buildLeafAcceptorConfig();
    const configFile = await this.writeConfigFile(config, 'leaf-acceptor');
    const args = ['-config', configFile];

    this.logger.debug(`Starting Nats leaf-acceptor: ${this.configService.NATS_BINARY} ${args.join(' ')}`);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(this.configService.NATS_BINARY, args);
      this.leafAcceptorProcess = proc;

      let settled = false;
      let pid: number | undefined;

      proc.once('spawn', () => {
        pid = proc.pid;
        if (pid) {
          this.configService.addProcess({ pid, startTime: Date.now(), command: this.configService.NATS_BINARY, args });
        }
      });

      proc.once('error', (error: Error) => {
        this.logger.error('The Nats leaf-acceptor process failed to start!', error);
        if (!settled) {
          settled = true;
          reject(error);
        }
      });

      proc.once('exit', () => {
        this.configService.removeProcessByPID(pid);
        if (this.leafAcceptorProcess === proc) {
          this.leafAcceptorProcess = undefined;
        }
        if (!this.restartingLeafAcceptor && !isShuttingDown() && !this.manuallyKilled) {
          this.logger.warn('Leaf-acceptor exited unexpectedly — restarting in 3s');
          setTimeout(() => {
            if (!this.restartingLeafAcceptor && !isShuttingDown() && !this.manuallyKilled) {
              this.startLeafAcceptor().catch((error) => this.logger.error('Failed to restart leaf-acceptor:', error));
            }
          }, 3000);
        }
      });

      const rl = createInterface({ input: proc.stdout, terminal: false });
      const rlErr = createInterface({ input: proc.stderr, terminal: false });
      const onLine = (line: string) => {
        if (settled) return;
        if (line.includes(SERVER_READY_MESSAGE)) {
          settled = true;
          this.logger.log(`Leaf-acceptor ready (PID: ${proc.pid})`);
          resolve();
          rl.close();
          rlErr.close();
        } else if (line.includes(SERVER_ERROR_MESSAGE)) {
          settled = true;
          reject(new Error('Error starting Nats leaf-acceptor!'));
          rl.close();
          rlErr.close();
        }
      };
      rl.on('line', onLine);
      rlErr.on('line', onLine);
    });
  }

  private setupProcess(natsProcess: ChildProcess, args: string[], configFile: string, name: string, resolve: () => void, reject: (error: Error) => void): void {
    let natsPID: number | undefined = undefined;

    natsProcess.once('spawn', () => {
      this.logger.log(`Initializing process with PID: ${natsProcess.pid}`);
      natsPID = natsProcess.pid;

      if (natsPID) {
        this.configService.addProcess({
          pid: natsPID,
          startTime: Date.now(),
          command: this.configService.NATS_BINARY,
          args,
        });
      }
    });

    natsProcess.once('error', (error: Error) => {
      this.logger.error(`The Nats ${name} process failed to start/stop!`, error);
      reject(error);
    });

    natsProcess.once('exit', () => {
      if (name === 'server') {
        this.setStatus(RUNTIME_STATUS.STOPPED);
        this.configService.removeProcessByPID(natsPID);

        setTimeout(() => {
          this.handleClose();
          resolve();
        }, 100);
      } else {
        this.clusterProcesses = this.clusterProcesses.filter((p) => p !== natsProcess);
        setTimeout(() => {
          this.handleCloseCluster(configFile);
        }, 100);
      }
    });

    const closeInterface = () => {
      if (name !== 'server') {
        this.stdoutLine?.close();
        this.stderrLine?.close();
      }
    };

    const listen = (line: string) => {
      if (name === 'server') {
        this.processLogger(line);
      }

      if (this.status === RUNTIME_STATUS.STARTING || this.status === RUNTIME_STATUS.STARTED) {
        if (line.includes(SERVER_READY_MESSAGE)) {
          resolve();
          closeInterface();
        } else if (line.includes(SERVER_ERROR_MESSAGE)) {
          reject(new Error(`Error starting Nats ${name}!`));
          closeInterface();
        }
      }
    };

    this.stdoutLine = createInterface({
      input: natsProcess.stdout!,
      terminal: false,
    });

    this.stderrLine = createInterface({
      input: natsProcess.stderr!,
      terminal: false,
    });

    this.stdoutLine.on('line', listen.bind(this));
    this.stderrLine.on('line', listen.bind(this));
  }

  private async writeConfigFile(config: any, name: string): Promise<string> {
    const configFile = join(this.tmpDir, `nats-server-${name}.conf`);
    const configContent = this.stringifyConfig(config);
    await writeFile(configFile, configContent);
    return configFile;
  }

  private stringifyConfig(config: any, pad = ''): string {
    const lines: string[] = [];
    for (const key in config) {
      if (Object.prototype.hasOwnProperty.call(config, key)) {
        const value = config[key];
        if (Array.isArray(value)) {
          lines.push(`${pad}${key} [`);
          lines.push(this.stringifyConfig(value, pad + '  '));
          lines.push(`${pad}]`);
        } else if (typeof value === 'object') {
          const keyName = Array.isArray(config) ? '' : key;
          lines.push(`${pad}${keyName} {`);
          lines.push(this.stringifyConfig(value, pad + '  '));
          lines.push(`${pad}}`);
        } else {
          const escapedValue = typeof value === 'string' ? `"${value.replace(/"/g, '\\"')}"` : value;
          if (!Array.isArray(config)) {
            lines.push(`${pad}${key}: ${escapedValue}`);
          } else {
            lines.push(pad + escapedValue);
          }
        }
      }
    }
    return lines.join('\n');
  }

  private async kill(childProcess: ChildProcess): Promise<void> {
    return new Promise((resolve) => {
      const res = (): void => {
        clearTimeout(killTimeout);
        resolve();
      };

      childProcess.on('exit', () => {
        res();
      });
      childProcess.kill('SIGKILL');

      const killTimeout = setTimeout(() => res(), 3000);
    });
  }

  private handleClose(): void {
    if (!isShuttingDown() && !this.manuallyKilled) {
      this.logger.error('Nats server crashed!');
      process.kill(process.pid, 'SIGINT');
    }
  }

  private handleCloseCluster(configFile: string): void {
    if (!isShuttingDown() && !this.manuallyKilled && this.status === RUNTIME_STATUS.STARTED) {
      this.logger.log('Restarting Nats cluster in 3s...');

      setTimeout(() => {
        if (isShuttingDown() || this.manuallyKilled || this.status !== RUNTIME_STATUS.STARTED) {
          this.logger.log('Cancelled restarting nats cluster!');
          return;
        }

        this.startClusterServer(configFile);
      }, 3000);
    }
  }

  private setStatus(status: RUNTIME_STATUS): void {
    this._status = status;

    const socketService = container.resolve<SocketService>('socketService');

    const runtimeInfo: ServerRuntime = {
      nats: { name: 'nats', status: status },
    };

    socketService.io?.of('/status').emit('process-status', runtimeInfo);
  }

  private processLogger(line: string): void {
    const blankLine = strip(line.replace(/\[(\d+)\] (\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\.\d{6}) /, ''));

    if (this.isIgnorableString(blankLine)) {
      return;
    }

    if (blankLine.includes('WRN')) {
      this.logger.warn(blankLine);
    } else if (blankLine.includes('FTL') || blankLine.includes('ERR')) {
      this.logger.error(blankLine);
    } else {
      this.logger.trace(blankLine);
    }
  }

  private isIgnorableString(line: string): boolean {
    switch (true) {
      case line.includes('Git:'):
      case line.includes('Name:'):
      case line.includes('ID:'):
      case line.includes('Route connection created'):
      case line.includes('Using configuration file'):
      case line.includes('Listening for route connections'):
      case line.includes('Cluster name is'):
      case line.includes('Plaintext passwords detected'):
      case line.includes('Maximum payloads over'):
        return true;
      default:
        return false;
    }
  }
}
