import { pickPort } from '@camera.ui/common/camera';
import { IS_DEV, sleep } from '@camera.ui/common/utils';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { stripVTControlCharacters } from 'node:util';

import { inject, provide, tryInject } from '../container.js';
import { RUNTIME_STATUS } from '../services/config/types.js';
import { isShuttingDown } from '../shutdown-state.js';
import { DETACHED_IN_DEV } from '../utils/tracked-processes.js';
import { isLeafDialError, LeafConnection } from './leafConnection.js';
import { SUBJECT_TOKEN } from './namespaces.js';
import { RepeatedLines } from './repeatedLines.js';
import { generateCredentials, workerConnId } from './utils.js';

import type { Logger } from '@camera.ui/common/logger';
import type { ChildProcess, ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Interface } from 'node:readline';
import type { ServerRuntime } from '../api/websocket/types.js';
import type { ConfigService } from '../services/config/index.js';
import type { AuthConfig, NatsConfig, NatsUserConfig, ProxyAuth } from './interfaces/config.js';

const SERVER_READY_MESSAGE = 'Server is ready';
const SERVER_ERROR_MESSAGE = 'Error listening on port';

const LEAF_ACCEPTOR_RESTART_MS = [250, 1000, 5000, 15_000, 30_000];
const LEAF_ACCEPTOR_CALM_MS = 60_000;

const WORKER_NATS_RESTART_MS = [500, 1000, 2000, 5000];
const WORKER_NATS_CRASH_LIMIT = 5;
const WORKER_NATS_CRASH_WINDOW_MS = 60_000;

const NATS_LEVEL = /^\[(TRC|DBG|INF|WRN|ERR|FTL)\]\s/;
const PROBE_HANGUP = 'TLS leafnode handshake error: EOF';

const WORKER_LEAF_DENY = ['rpc.terminalManager.>', 'stream.rpc.terminalManager.>', 'terminalManager.>', 'tunnel.>', 'notifications.user.>', 'cast.>'];
const SHARED_WORKER_SUBJECTS = ['rpc.workers.manager.rpc.>', 'workers.logs', 'workers.disconnect'];

const TUNNEL_AGENT_PERMISSIONS = {
  publish: { allow: ['tunnel.client.>', 'tunnel.server.credentials'] },
  subscribe: { allow: ['tunnel.client.>', '_INBOX.>'] },
  allow_responses: true,
};

export interface LeafNodeUser {
  agentId: string;
  user: string;
  password: string;
}

export interface LeafNodeConfig {
  enabled: boolean;
  host: string;
  port: number;
  users: LeafNodeUser[];
  tlsCertFile: string;
  tlsKeyFile: string;
}

export interface LeafNodeRemoteConfig {
  url: string;
  caFile: string;
  disabled?: boolean;
}

export class NATS {
  public readonly leaf = new LeafConnection();
  public readonly tunnelAuth = generateCredentials();
  public onFatal?: (reason: string) => void;

  private readonly clusterAmount = 0;

  private _serverPort!: number;
  private _clusterPort!: number;
  private _wsPort!: number;
  private _leafAcceptorPort!: number;
  private _endpoints: string[] = [];
  private leafNodeConfig?: LeafNodeConfig;
  private leafNodeRemotes?: LeafNodeRemoteConfig[];

  private serverProcess?: ChildProcess;
  private serverConfig?: NatsConfig;
  private clusterProcesses: ChildProcess[] = [];

  private leafAcceptorProcess?: ChildProcess;
  private restartingLeafAcceptor = false;
  private leafAcceptorRestartTimer?: NodeJS.Timeout;
  private leafAcceptorLastExit = 0;
  private leafAcceptorCrashes = 0;
  private _leafAcceptorError?: string;
  private clusterListenerEnabled = false;

  private logger: Logger;
  private configService: ConfigService;
  private repeatedLines: RepeatedLines;

  private tmpDir: string;
  private config: NatsConfig;

  private manuallyKilled = false;
  private serverCrashes: number[] = [];
  private serverRestartTimer?: NodeJS.Timeout;

  private stdoutLine?: Interface;
  private stderrLine?: Interface;

  private _status: RUNTIME_STATUS = RUNTIME_STATUS.UNKNOWN;

  constructor(private readonly auth: ProxyAuth) {
    provide('natsServer', this);

    this.configService = inject('configService');

    const loggerService = inject('logger');
    this.logger = loggerService.createSystemLogger('Nats', 'nats');
    this.repeatedLines = new RepeatedLines((level, line) => this.logger[level](line));

    this.tmpDir = mkdtempSync(join(this.configService.TMP_PATH, 'nats-'));

    this.config = {
      host: '127.0.0.1',
      port: 0,
      server_name: 'camera.ui-server',
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
                  'rpc.cb.>',
                  'stream.rpc.>',
                  '_rpc.iterator.>',

                  // plugin metadata reads only, everything else on coreManager writes or is server-internal
                  'rpc.coreManager.rpc.getPlugin',
                  'rpc.coreManager.rpc.getPluginsByInterface',

                  'rpc.deviceManager.rpc.getCamera',

                  // list and states only, the registry writes share this namespace
                  'rpc.sensors.rpc.getSensors',
                  'rpc.sensors.rpc.getSensorStates',

                  'rpc.camera.*.controller.rpc.snapshot',
                  'rpc.camera.*.controller.rpc.snapshotWithMeta',
                  'rpc.camera.*.controller.rpc.probeStream',
                  'rpc.camera.*.controller.rpc.refreshStates',

                  'rpc.plugin.*.child.rpc.getInstanceId',
                  'rpc.plugin.*.child.rpc.getEvents',
                  'rpc.plugin.*.child.rpc.getCameraEvents',
                  'rpc.plugin.*.child.rpc.getEventStats',
                  'rpc.plugin.*.child.rpc.getEventThumbnails',
                  'rpc.plugin.*.child.rpc.getEpisodes',
                  'rpc.plugin.*.child.rpc.getEpisode',
                  'rpc.plugin.*.child.rpc.getEpisodeMosaic',
                  'rpc.plugin.*.child.rpc.getDetectionHeatmap',
                  'rpc.plugin.*.child.rpc.getRecordingDays',
                  'rpc.plugin.*.child.rpc.getRecordingSegments',
                  'rpc.plugin.*.child.rpc.getRecordingCoverage',
                  'rpc.plugin.*.child.rpc.getManagedCameraIds',
                  'rpc.plugin.*.child.rpc.getStorageStats',
                  'rpc.plugin.*.child.rpc.getSystemEvents',
                  'rpc.plugin.*.child.rpc.getClipReindexStatus',
                  'rpc.plugin.*.child.rpc.onClipReindex',
                  'rpc.plugin.*.child.rpc.getFacesRescanStatus',
                  'rpc.plugin.*.child.rpc.onFacesRescan',
                  'rpc.plugin.*.child.rpc.onRecordingState',
                  'rpc.plugin.*.child.rpc.onSystemEvent',
                  'rpc.plugin.*.child.rpc.onEventsDeleted',
                  'rpc.plugin.*.child.rpc.onRecordingsDeleted',
                  'rpc.plugin.*.child.rpc.onDetectionEvent',
                  'rpc.plugin.*.child.rpc.nvrScrub',
                  'rpc.plugin.*.child.rpc.nvrPlayback',
                  'rpc.plugin.*.child.rpc.nvrPlaybackCmd',
                  'rpc.plugin.*.child.rpc.nvrPreviewFrames',
                  'rpc.plugin.*.child.rpc.nvrExport',
                  'rpc.plugin.*.child.rpc.nvrExportBatch',
                  'rpc.plugin.*.child.rpc.nvrExportEstimate',
                  'rpc.plugin.*.child.rpc.nvrExportEpisode',
                  'rpc.plugin.*.child.rpc.searchEventsByText',
                  'rpc.plugin.*.child.rpc.searchEventsByTextQuery',

                  // any account may be a cast target, casting stays an admin call
                  'cast.presence',

                  'rpc.coreManager.rpc.__methods',
                  'rpc.deviceManager.rpc.__methods',
                  'rpc.sensors.rpc.__methods',
                  'rpc.camera.*.controller.rpc.__methods',
                  'rpc.plugin.*.child.rpc.__methods',
                ],
              },
              subscribe: {
                allow: [
                  // the relay firewall pins each inbox to the connId
                  'rpc.reply.>',
                  'rpc.cb.>',
                  '_rpc.cb.>',
                  '_rpc.iterator.>',
                  '_INBOX.>',
                  'notifications.user.*',

                  // broadcasts only, a request subject would hand a viewer its caller's reply inbox
                  'coreManager.subscriber',
                  'camera.*.subscriber',
                  // still read by released nvr UI and tvOS builds
                  'camera.*.events.subject',
                  'sensors.subject',
                  'sensor.*.subject',
                  'cast.device.*',
                ],
              },
            },
          },
          {
            user: this.tunnelAuth.user,
            password: this.tunnelAuth.password,
            permissions: TUNNEL_AGENT_PERMISSIONS,
          },
        ],
      },
      // 4 MB keeps snapshot and thumbnail batches out of the chunking path
      max_payload: 4 * 1024 * 1024,
      max_control_line: 4096, // fits any subject, headers and reply-to
      // the nats default, bounds a dead browser socket
      write_deadline: '10s',
    };

    if (this.clusterAmount > 0) {
      this.config.cluster = {
        name: 'camera.ui-cluster',
        host: '127.0.0.1',
        port: 0,
        routes: [],
        authorization: {
          timeout: 5,
          ...this.auth.cluster,
        },
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

  public get leafAcceptorError(): string | undefined {
    return this._leafAcceptorError;
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

  public setServerName(name: string): void {
    this.config.server_name = name;
  }

  public linkConfirmed(): void {
    this.leaf.reset();
    this.repeatedLines.settle(isLeafDialError, 'until the link came up');
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
    this._serverPort ||= await loopbackPort();
    this._clusterPort ||= await loopbackPort();
    this._wsPort ||= await loopbackPort();

    this._endpoints = [`nats://127.0.0.1:${this._serverPort}`];

    const config: NatsConfig = {
      ...this.config,
      port: this._serverPort,
      // TLS ends at the /api/proxy relay, and nats ignores no_tls while a tls block exists
      websocket: {
        host: '127.0.0.1',
        port: this.wsPort,
        no_tls: true,
      },
    };

    if (this.clusterListenerEnabled) {
      this._leafAcceptorPort ||= await loopbackPort();
      config.cluster = {
        name: 'camera.ui-cluster',
        host: '127.0.0.1',
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
      config.http = await loopbackPort();
    }

    if (this.leafNodeRemotes?.length) {
      (config as any).leafnodes = {
        // rejected workers retry this fast until the agent pauses the remote, not on Windows
        reconnect: '500ms',
        remotes: this.leafNodeRemotes.map((remote) => ({
          url: remote.url,
          disabled: remote.disabled,
          compression: 'off',
          ignore_discovered_servers: true,
          tls: {
            ca_file: remote.caFile,
          },
        })),
      };
      // every 8th failed dial, logLine collapses the repeats
      (config as any).reconnect_error_reports = 8;
      // a dead leaf shows in 10 to 15 s, before the lease ends
      config.ping_interval = '5s';
      config.ping_max = 2;
    }

    this.serverConfig = config;
    const serverConfig = await this.writeConfigFile(config, 'server');
    await this.startServer(serverConfig);

    if (this.leafNodeConfig?.enabled && !this.leafAcceptorProcess) {
      this.launchLeafAcceptor('Leaf-acceptor did not start, workers cannot connect until it does');
    }
  }

  private buildLeafAcceptorConfig(): NatsConfig {
    const leaf = this.leafNodeConfig!;

    const config: NatsConfig = {
      host: '127.0.0.1',
      port: this._leafAcceptorPort,
      server_name: 'camera.ui-leaf-acceptor',
      // leafnodes users take no permissions, leaf links log in here and only worker users may open one
      authorization: {
        timeout: this.config.authorization.timeout,
        users: [
          ...this.config.authorization.users.map((user): NatsUserConfig => ({ ...user, allowed_connection_types: ['STANDARD'] })),
          ...leaf.users.map((user) => workerLeafUser(user, leaf.users)),
        ],
      },
      max_payload: this.config.max_payload,
      max_control_line: this.config.max_control_line,
      write_deadline: this.config.write_deadline,
      // a half-open leaf goes after about 30 s instead of 4 min
      ping_interval: '10s',
      ping_max: 3,
      cluster: {
        name: 'camera.ui-cluster',
        host: '127.0.0.1',
        // bound after ready, a taken fixed port would kill it unseen; nobody dials it
        port: -1,
        routes: [`nats://${this.auth.cluster.user}:${this.auth.cluster.password}@127.0.0.1:${this._clusterPort}`],
        authorization: { timeout: 5, ...this.auth.cluster },
      },
    };

    (config as any).leafnodes = {
      host: leaf.host,
      port: leaf.port,
      // s2 does not shrink camera frames, off here disables it for old workers too
      compression: 'off',
      no_advertise: true,
      tls: {
        cert_file: leaf.tlsCertFile,
        key_file: leaf.tlsKeyFile,
      },
    };

    return config;
  }

  private async configClusters(): Promise<void> {
    if (!this.config.cluster) {
      return;
    }

    for (let i = 0; i < this.clusterAmount; i++) {
      const _clusterPort = await loopbackPort();
      this._endpoints.push(`nats://127.0.0.1:${_clusterPort}`);

      const config = {
        ...this.config,
        server_name: `camera.ui-cluster-${i}`,
        port: _clusterPort,
        cluster: {
          ...this.config.cluster,
          port: await loopbackPort(),
          routes: [`nats://${this.config.cluster.authorization.user}:${this.config.cluster.authorization.password}@127.0.0.1:${this._clusterPort}`],
        },
      };

      const clusterConfig = await this.writeConfigFile(config, `cluster-${i}`);
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 100)); // wait for port
      await this.startClusterServer(clusterConfig);
    }
  }

  public async stop(): Promise<void> {
    this.manuallyKilled = true;
    clearTimeout(this.serverRestartTimer);

    this.logger.log('Stopping Nats server and cluster...');

    const promises = this.clusterProcesses.map((process) => this.kill(process));

    this.cancelLeafAcceptorRestart();
    if (this.leafAcceptorProcess) {
      promises.push(this.kill(this.leafAcceptorProcess));
    }

    if (this.serverProcess) {
      promises.push(this.kill(this.serverProcess));
    }

    await Promise.all(promises);
    this.leafAcceptorProcess = undefined;
    this.leaf.reset();
    this.repeatedLines.flush();

    this.stdoutLine?.close();
    this.stderrLine?.close();
  }

  public async pauseLeafRemotes(paused: boolean): Promise<boolean> {
    const leafnodes = (this.serverConfig as any)?.leafnodes;
    if (process.platform === 'win32' || !leafnodes?.remotes || !this.serverProcess) {
      return false;
    }

    leafnodes.remotes = leafnodes.remotes.map((remote: object) => ({ ...remote, disabled: paused }));
    await this.writeConfigFile(this.serverConfig, 'server');
    return this.serverProcess.kill('SIGHUP');
  }

  public async reconcileLeafAcceptor(): Promise<void> {
    // also without users, so a removed worker gets a rejection, not a refused connection
    const shouldRun = !!this.leafNodeConfig?.enabled;
    this.cancelLeafAcceptorRestart();

    if (!shouldRun) {
      this._leafAcceptorError = undefined;
      if (this.leafAcceptorProcess) {
        this.logger.log('Stopping leaf-acceptor (workers disabled)');
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

    try {
      await this.startLeafAcceptor();
    } catch (error) {
      this.scheduleLeafAcceptorRestart();
      throw error;
    } finally {
      this.restartingLeafAcceptor = false;
    }
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
      this.serverProcess = this.spawnNats(args);
      this.setupProcess(this.serverProcess, args, configFile, 'server', resolve, reject);
    });
  }

  private async startClusterServer(configFile: string): Promise<void> {
    const args = ['-config', configFile];

    this.logger.debug(`Starting Nats cluster server with following command: ${this.configService.NATS_BINARY} ${args.join(' ')}`);

    await new Promise<void>((resolve, reject) => {
      const clusterProcess = this.spawnNats(args);
      this.setupProcess(clusterProcess, args, configFile, 'cluster', resolve, reject);
      this.clusterProcesses.push(clusterProcess);
    });
  }

  private async startLeafAcceptor(): Promise<void> {
    const config = this.buildLeafAcceptorConfig();
    const configFile = await this.writeConfigFile(config, 'leaf-acceptor');
    const args = ['-config', configFile];

    this.logger.debug(`Starting Nats leaf-acceptor: ${this.configService.NATS_BINARY} ${args.join(' ')}`);

    await new Promise<void>((resolve, reject) => {
      const proc = this.spawnNats(args);
      this.leafAcceptorProcess = proc;

      let settled = false;
      let ready = false;
      let pid: number | undefined;
      let failure: string | undefined;
      const fail = (error: Error): void => {
        this._leafAcceptorError = failure ?? error.message;
        settled = true;
        reject(error);
      };

      proc.once('spawn', () => {
        pid = proc.pid;
        if (pid) {
          this.configService.addProcess({ pid, startTime: Date.now(), command: this.configService.NATS_BINARY, args });
        }
      });

      proc.once('error', (error: Error) => {
        this.logger.error('The Nats leaf-acceptor process failed to start!', error);
        // a process that never spawned sends no exit
        if (pid === undefined && this.leafAcceptorProcess === proc) {
          this.leafAcceptorProcess = undefined;
        }
        if (!settled) {
          fail(error);
        }
      });

      proc.once('exit', () => {
        this.configService.removeProcessByPID(pid);
        if (this.leafAcceptorProcess === proc) {
          this.leafAcceptorProcess = undefined;
        }
        if (!settled) {
          fail(new Error('Nats leaf-acceptor exited before it was ready'));
        }
        if (!this.restartingLeafAcceptor && !isShuttingDown() && !this.manuallyKilled) {
          this._leafAcceptorError ??= failure ?? 'Nats leaf-acceptor exited unexpectedly';
          this.scheduleLeafAcceptorRestart();
        }
      });

      const rl = createInterface({ input: proc.stdout, terminal: false });
      const rlErr = createInterface({ input: proc.stderr, terminal: false });
      const onLine = (line: string) => {
        const stripped = this.stripLine(line);
        this.logLine(`leaf-acceptor: ${stripped}`);
        // a running acceptor logs [ERR] per bad client, only [FTL] ends it
        const failed = /^\[(FTL|ERR)\] (.*)$/.exec(stripped);
        if (failed && (failed[1] === 'FTL' || !ready)) {
          failure = failed[2];
          // the exit can arrive before the line that explains it
          if (this._leafAcceptorError !== undefined) this._leafAcceptorError = failure;
        }
        if (settled) return;
        if (line.includes(SERVER_READY_MESSAGE)) {
          settled = true;
          ready = true;
          this._leafAcceptorError = undefined;
          this.logger.log(`Leaf-acceptor ready (PID: ${proc.pid})`);
          resolve();
        } else if (line.includes(SERVER_ERROR_MESSAGE)) {
          fail(new Error('Error starting Nats leaf-acceptor!'));
        }
      };
      rl.on('line', onLine);
      rlErr.on('line', onLine);
    });
  }

  private scheduleLeafAcceptorRestart(): void {
    const now = Date.now();
    this.leafAcceptorCrashes = now - this.leafAcceptorLastExit > LEAF_ACCEPTOR_CALM_MS ? 0 : this.leafAcceptorCrashes + 1;
    this.leafAcceptorLastExit = now;
    const delay = LEAF_ACCEPTOR_RESTART_MS[Math.min(this.leafAcceptorCrashes, LEAF_ACCEPTOR_RESTART_MS.length - 1)];

    this.logger.warn(`Leaf-acceptor is not running, starting it again in ${delay} ms`);
    clearTimeout(this.leafAcceptorRestartTimer);
    this.leafAcceptorRestartTimer = setTimeout(() => {
      this.leafAcceptorRestartTimer = undefined;
      if (this.leafAcceptorProcess || this.restartingLeafAcceptor || isShuttingDown() || this.manuallyKilled) return;
      this.launchLeafAcceptor('Failed to restart leaf-acceptor');
    }, delay);
  }

  private launchLeafAcceptor(failure: string): void {
    this.startLeafAcceptor().catch((error) => {
      this.logger.error(`${failure}: ${error.message}`);
      this._leafAcceptorError ??= error.message;
      if (this.leafAcceptorRestartTimer || this.leafAcceptorProcess || this.restartingLeafAcceptor || isShuttingDown() || this.manuallyKilled) return;
      this.scheduleLeafAcceptorRestart();
    });
  }

  private cancelLeafAcceptorRestart(): void {
    clearTimeout(this.leafAcceptorRestartTimer);
    this.leafAcceptorRestartTimer = undefined;
  }

  private spawnNats(args: string[]): ChildProcessWithoutNullStreams {
    // GOGC 400 saves most GC cycles on frames above 64 KB, only for nats and not the Go plugins
    return spawn(this.configService.NATS_BINARY, args, { windowsHide: true, detached: DETACHED_IN_DEV, env: { GOGC: '400', ...process.env } });
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
        // nats reads a bare undefined as a string and refuses the file
        if (value === undefined) {
          continue;
        }
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
          // backslashes before quotes: nats reads \ as an escape, a raw Windows path like C:\Users crashes it
          const escapedValue = typeof value === 'string' ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : value;
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
    if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
      return;
    }

    return new Promise((resolve) => {
      const res = (): void => {
        clearTimeout(killTimeout);
        resolve();
      };

      childProcess.once('exit', () => {
        res();
      });
      childProcess.kill('SIGKILL');

      const killTimeout = setTimeout(() => res(), 3000);
    });
  }

  private handleClose(): void {
    if (isShuttingDown() || this.manuallyKilled) {
      return;
    }

    if (!this.leafNodeRemotes?.length) {
      this.logger.error('Nats server crashed, stopping camera.ui');
      this.onFatal?.('nats server crashed');
      return;
    }

    const now = Date.now();
    this.serverCrashes = [...this.serverCrashes.filter((at) => now - at < WORKER_NATS_CRASH_WINDOW_MS), now];
    if (this.serverCrashes.length >= WORKER_NATS_CRASH_LIMIT) {
      this.logger.error(`Nats server crashed ${this.serverCrashes.length} times in ${WORKER_NATS_CRASH_WINDOW_MS / 1000} s, stopping the worker`);
      this.onFatal?.('nats server keeps crashing');
      return;
    }

    const delay = WORKER_NATS_RESTART_MS[Math.min(this.serverCrashes.length - 1, WORKER_NATS_RESTART_MS.length - 1)];
    this.logger.warn(`Nats server exited unexpectedly, restarting in ${delay} ms`);
    clearTimeout(this.serverRestartTimer);
    this.serverRestartTimer = setTimeout(() => {
      if (isShuttingDown() || this.manuallyKilled) {
        return;
      }
      this.leaf.reset();
      this.setStatus(RUNTIME_STATUS.STARTING);
      this.configServer()
        .then(() => this.setStatus(RUNTIME_STATUS.STARTED))
        .catch((error) => this.logger.error(`Nats server did not come back: ${error.message}`));
    }, delay);
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

    const runtimeInfo: ServerRuntime = {
      nats: { name: 'nats', status: status },
    };

    tryInject('socketService')?.io.of('/status').emit('process-status', runtimeInfo);
  }

  private processLogger(line: string): void {
    const blankLine = this.stripLine(line);
    this.leaf.observe(blankLine);
    this.logLine(blankLine);
  }

  private stripLine(line: string): string {
    return stripVTControlCharacters(line.replace(/\[(\d+)\] (\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\.\d{6}) /, ''));
  }

  private logLine(blankLine: string): void {
    const body = blankLine.replace(/^leaf-acceptor: /, '');
    if (this.isIgnorableString(body)) {
      return;
    }

    const level = NATS_LEVEL.exec(body)?.[1];
    if (level === 'WRN') {
      this.repeatedLines.push('warn', blankLine);
    } else if (level === 'ERR' && body.includes(PROBE_HANGUP)) {
      this.logger.debug(blankLine);
    } else if (level === 'ERR' || level === 'FTL') {
      this.repeatedLines.push('error', blankLine);
    } else {
      this.logger.trace(blankLine);
    }
  }

  private isIgnorableString(line: string): boolean {
    switch (true) {
      case /^\[INF\]\s+(Git|Name|ID):/.test(line):
      case line.includes('Route connection created'):
      case line.includes('Using configuration file'):
      case line.includes('Listening for route connections'):
      case line.includes('Cluster name is'):
      case line.includes('Plaintext passwords detected'):
      case line.includes('Maximum payloads over'):
      case line.includes('Websocket not configured with TLS'):
        return true;
      default:
        return false;
    }
  }
}

function workerLeafUser(worker: LeafNodeUser, workers: LeafNodeUser[]): NatsUserConfig {
  const others = workers.filter(({ agentId }) => agentId !== worker.agentId && SUBJECT_TOKEN.test(agentId));
  const otherAgents = others.map(({ agentId }) => agentId);
  const otherPrivate = others.flatMap(({ agentId, password }) => {
    const connId = workerConnId(agentId, password);
    return [`rpc.workers.${agentId}.>`, `workers.${agentId}.>`, `rpc.reply.${connId}.>`, `_INBOX.${connId}.>`];
  });

  return {
    user: worker.user,
    password: worker.password,
    allowed_connection_types: ['LEAFNODE'],
    permissions: {
      publish: { deny: [...WORKER_LEAF_DENY, ...SHARED_WORKER_SUBJECTS, ...otherPrivate, 'rpc.worker.>', 'worker.>'] },
      subscribe: {
        deny: [...WORKER_LEAF_DENY, ...SHARED_WORKER_SUBJECTS, ...otherPrivate, ...otherAgents.flatMap((agentId) => [`rpc.worker.${agentId}.>`, `worker.${agentId}.>`])],
      },
    },
  };
}

function loopbackPort(): Promise<number> {
  return pickPort({ type: 'tcp', ip: '127.0.0.1' });
}
