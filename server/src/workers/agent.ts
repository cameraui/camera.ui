import { fetchViableNetworkAddresses } from '@camera.ui/common/network';
import { UPDATE_STATE_FILE } from '@camera.ui/common/node';
import { IS_ELECTRON } from '@camera.ui/common/utils';
import { createRPCClient, ERROR_CODES, isNoRespondersError, isRPCError } from '@camera.ui/rpc';
import { PROTOCOL_LEVEL } from '@camera.ui/sdk';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { processes } from 'systeminformation';

import { WorkersService } from '../api/services/workers.service.js';
import { inject } from '../container.js';
import { NamespaceManager } from '../rpc/namespaces.js';
import { workerConnId } from '../rpc/utils.js';
import { MASTER_API_PORT, workerName } from '../services/config/defaults.js';
import { ConfigService } from '../services/config/index.js';
import { assertServerUpdateSpace } from '../utils/disk-space.js';
import { MIN_SUPPORTED_PROTOCOL_LEVEL } from '../utils/engines.js';
import { setInstancePrefix } from '../utils/instance-id.js';
import { announceUpdateChannel, appUpdateState, canRequestServerUpdate, requestAppUpdateCheck, requestServerUpdate, sendIPCMessage } from '../utils/ipc.js';
import { hostPlatform } from '../utils/platform.js';
import { KILL_MARGIN_MS } from '../utils/supervised-child.js';
import { collectSystemInfo } from '../utils/system-info.js';
import { FrameDecodingHandler } from './capabilities/frame-decoding.js';
import { PluginHostHandler } from './capabilities/plugin-host.js';
import { clockTime, shortId } from './lifecycle/format.js';
import { LeaseWatchdog } from './lifecycle/lease-watchdog.js';
import { elapsed, leaseRemaining, stamp } from './lifecycle/lease.js';
import { Reconciler } from './lifecycle/reconciler.js';
import { STATUS_FILE_NAME, StatusFile } from './lifecycle/status-file.js';
import {
  HEARTBEAT_TIMEOUT_MS,
  LEASE_MAX_MS,
  LEASE_MIN_MS,
  LEASE_MS,
  LEASE_STOP_GRACE_MS,
  LEASE_TICK_MS,
  LEGACY_LEASE_MS,
  MASTER_SEARCH_AFTER_MS,
  MASTER_SEARCH_MS,
  NOTICE_CAP_MS,
  REJECT_DIAL_MS,
  REJECT_DIAL_SLOW_AFTER,
  REJECT_SPACING_MS,
  REJECT_TO_STATE,
  RELEASED_HEARTBEAT_MS,
  REPORT_DEBOUNCE_MS,
  SILENT_WARN_MS,
  SPAWN_REPORT_WAIT_MS,
  SUSPEND_MAX_MS,
  SYNC_INTERVAL_MS,
  UNPAIRED_POLL_MS,
  WORKER_EXPECT_BACK_MS,
} from './lifecycle/timing.js';
import { versionStanding } from './lifecycle/update.js';
import { findMovedMaster, PairingWait } from './pairing.js';
import { StreamTunnelDialer } from './stream-tunnel.js';
import { WORKER_PROTOCOL, WorkerCapability, workloadKey } from './types.js';

import type { LogEntry, Logger } from '@camera.ui/common/logger';
import type { ShutdownReason, SupervisorSuspendMessage, UpdateState } from '@camera.ui/common/node';
import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type { LeafRejection } from '../rpc/leafConnection.js';
import type { NATS } from '../rpc/server.js';
import type { SystemInfo } from '../utils/system-info.js';
import type { CapabilityHandler, HostedStatus } from './capabilities/handler.js';
import type { LeaseView } from './lifecycle/lease.js';
import type { StopReason } from './lifecycle/managed-workload.js';
import type { DesiredState } from './lifecycle/reconciler.js';
import type { WorkloadMode } from './lifecycle/workload.js';
import type { PairingState } from './pairing.js';
import type {
  DisconnectReason,
  HostPort,
  MasterSyncInfo,
  PluginPurge,
  RemotePluginConfig,
  WorkerAgentRPC,
  WorkerDisconnect,
  WorkerHealthInfo,
  WorkerHeartbeat,
  WorkerLease,
  WorkerManagerRPC,
  WorkerNudge,
  WorkerProcessRef,
  WorkerProcessSample,
  WorkerSyncResponse,
  WorkerUpdateState,
  WorkloadReport,
} from './types.js';

const METRICS_INTERVAL_MS = 15_000;
const HEALTHY_WITHOUT_MASTER_MS = 60_000;
const LINK_HINT_RETRY_MS = 250;
const LINK_HINT_WINDOW_MS = 3_000;
const LEASE_CHILD_MIN_MS = 500;
const LEASE_KILL_LEAD_MS = 500;
const UPDATE_RESULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const DISCONNECT_REASON: Record<ShutdownReason, Extract<DisconnectReason, 'stop' | 'restart' | 'update'>> = {
  stop: 'stop',
  restart: 'restart',
  update: 'update',
  reset: 'stop',
  unknown: 'restart',
};

export type AgentState = 'pairing' | 'linking' | 'legacy' | 'synced' | 'silent' | 'fenced' | 'released' | 'conflict' | 'rejected' | 'suspended' | 'unpaired' | 'closing';

const LEASED: ReadonlySet<AgentState> = new Set(['synced', 'legacy', 'silent']);
const MASTER_LOST: ReadonlySet<AgentState> = new Set(['linking', 'silent', 'fenced']);
const MUTE: ReadonlySet<AgentState> = new Set(['pairing', 'suspended', 'unpaired', 'closing']);

export class WorkerAgent implements WorkerAgentRPC {
  public readonly agentId: string;
  public readonly capabilities: WorkerCapability[];

  private readonly logger: Logger;
  private readonly configService: ConfigService;
  private readonly natsServer: NATS;
  private readonly workersService = new WorkersService();
  private readonly startTime = Date.now();
  private readonly workerName: string;

  private proxy?: RPCClient;
  private managerProxy!: Promisify<WorkerManagerRPC>;
  private sharedManagerProxy!: Promisify<WorkerManagerRPC>;
  private handlers = new Map<WorkerCapability, CapabilityHandler>();
  private reconciler: Reconciler;
  private statusFile: StatusFile;
  private watchdog: LeaseWatchdog;
  private tunnels: StreamTunnelDialer;
  private pairingWait: PairingWait;

  private pluginHostHandler?: PluginHostHandler;

  private boot!: string;
  private prevBootIds: string[] = [];
  private state: AgentState = 'linking';
  private stateReason?: string;
  private notifiedWorkloads = 0;
  private mode: WorkloadMode = 'legacy';
  private lease: LeaseView = { leaseMs: LEASE_MS };
  private answerRunId?: string;
  private appliedRun?: { runId: string; seq: number };
  private noticeRunId?: string;
  private reportSeq = 0;
  private tombstones = new Map<string, WorkloadReport>();
  private spawnWaiters = new Map<string, () => void>();

  private lastAnswerAt?: number;
  private silentWarned = false;
  private masterSearch?: Promise<void>;
  private nextMasterSearchAt = 0;
  private masterSearchDelay = MASTER_SEARCH_MS[0];
  private healthy = false;
  private syncInterval?: NodeJS.Timeout;
  private leaseInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;
  private healthyTimer?: NodeJS.Timeout;
  private reportTimer?: NodeJS.Timeout;
  private spawnReport?: NodeJS.Immediate;
  private suspendTimer?: NodeJS.Timeout;
  private inFlight = 0;
  private lastSentAt = 0;
  private cycleSeq = 0;
  private answeredSeq = 0;
  private syncQueued = false;
  private isClosed = false;
  private sharedMaster = false;
  private fencing?: Promise<void>;
  private releasing?: Promise<void>;
  private rejections = 0;
  private lastRejectionAt = 0;
  private dials = 0;
  private linkPaused = false;
  private linkResumeTimer?: NodeJS.Timeout;
  private linkHintTimer?: NodeJS.Timeout;
  private codeWatchTimer?: NodeJS.Timeout;
  private appliedUpdateChannel?: 'latest' | 'beta';
  private purged = new Set<string>();

  private closeHandler?: () => Promise<void>;
  private unsubscribeSync?: () => void;
  private onSupervisorMessage = (message: SupervisorSuspendMessage): void => {
    if (message?.type === 'SUSPEND') {
      this.suspend();
    } else if (message?.type === 'RESUME') {
      this.resume('woke up');
    }
  };

  private cpuLoad = '0.00';
  private memLoad = '0.00';
  private processSamples: WorkerProcessSample[] = [];
  private system?: SystemInfo;

  private updating = false;
  private updateError?: string;
  private updatePhase?: WorkerUpdateState['phase'];
  private updateTarget?: string;
  private lastUpdateResult?: WorkerUpdateState['lastResult'];
  private appCheckedFor?: string;

  constructor(
    private requestShutdown: (reason: ShutdownReason) => void,
    pairing: PairingState = { state: 'paired' },
  ) {
    this.configService = inject('configService');
    this.natsServer = inject('natsServer');

    this.workerName = workerName(this.configService.config.worker);
    this.agentId = this.workersService.getOrCreateAgentId(this.workerName);
    this.rotateBoot();

    const allCapabilities = Object.values(WorkerCapability);
    const validCapabilities = new Set(allCapabilities as string[]);
    const configuredCapabilities = this.configService.config.worker?.capabilities ?? [];
    this.capabilities =
      configuredCapabilities.length === 0 ? allCapabilities : (configuredCapabilities.filter((cap) => validCapabilities.has(cap)) as WorkerCapability[]);

    this.logger = inject('logger').createSystemLogger('WorkerAgent', 'workers', this.workerName);
    this.logger.onLog((entry) => {
      if (entry.level !== 'raw') this.forwardLog(entry);
    });

    this.reconciler = new Reconciler(this.handlers, this.logger, (desired) => this.onApplied(desired));
    this.tunnels = new StreamTunnelDialer(
      () => this.master,
      () => this.workersService.getWorkerConnection()?.apiPort ?? this.configService.config.worker?.apiPort ?? MASTER_API_PORT,
    );
    this.watchdog = new LeaseWatchdog((pids) => this.logger.error(`Killed ${pids.length} workloads that still ran after the lease ended`));
    this.statusFile = new StatusFile(join(this.configService.STORAGE_PATH, STATUS_FILE_NAME), () => ({
      state: this.state,
      reason: this.stateReason,
      master: this.master,
      lastAnswerAt: this.lastAnswerAt,
      workloads: this.workloadCount,
    }));
    this.pairingWait = new PairingWait(this.configService, this.logger, (result) => this.onPairing(result));

    if (pairing.state !== 'paired') {
      this.state = pairing.state;
      this.stateReason = pairing.reason;
    }
  }

  public get bootId(): string {
    return this.boot;
  }

  public async start(): Promise<void> {
    this.logger.log(`Starting WorkerAgent (id: ${this.agentId}, boot: ${shortId(this.boot)})`);
    this.statusFile.start();
    this.readUpdateResult();

    if (this.capabilities.length === 0) {
      const available = Object.values(WorkerCapability).join(', ');
      throw new Error(`Configured "worker.capabilities" are all unknown. Use one of: ${available}, or leave it empty to offer all.`);
    }

    const configuredCapabilities = this.configService.config.worker?.capabilities ?? [];
    const invalidCapabilities = configuredCapabilities.filter((cap) => !this.capabilities.includes(cap as WorkerCapability));
    if (invalidCapabilities.length > 0) {
      this.logger.warn(`Ignoring unknown capabilities: [${invalidCapabilities.join(', ')}]`);
    }

    this.logger.log(`Capabilities: [${this.capabilities.join(', ')}]`);

    this.natsServer.leaf.onRejected = (reason, kind) => this.onLinkRejected(reason, kind);
    this.natsServer.leaf.onCreated = () => this.followLinkHint();

    const secret = this.workersService.getWorkerConnection()?.secret;

    this.proxy = createRPCClient({
      name: `worker-agent-${this.agentId}`,
      connId: secret ? workerConnId(this.agentId, secret) : undefined,
      servers: this.natsServer.endpoints.filter((ep) => ep.startsWith('nats://')),
      timeout: 10_000,
      auth: {
        user: this.natsServer.localAuth.user,
        password: this.natsServer.localAuth.password,
      },
    });

    await this.proxy.connect();

    const mode = (): WorkloadMode => this.mode;
    const forward = (entry: LogEntry): void => this.forwardLog(entry);
    const hooks = { onChange: () => this.onWorkloadChange(), beforeSpawn: (instanceId: string) => this.waitForSpawnReport(instanceId) };
    for (const cap of this.capabilities) {
      switch (cap) {
        case WorkerCapability.FrameDecoding:
          this.handlers.set(cap, new FrameDecodingHandler(this.agentId, this.natsServer, this.configService, this.logger, forward, mode, hooks));
          break;
        case WorkerCapability.PluginHost:
          this.pluginHostHandler = new PluginHostHandler(this.agentId, this.configService, this.logger, forward, mode, hooks);
          this.handlers.set(cap, this.pluginHostHandler);
          break;
        default:
          this.logger.warn(`No handler for capability: ${cap}`);
      }
    }

    const callOptions = { timeout: HEARTBEAT_TIMEOUT_MS, noResponderRetry: { maxRetries: 0 } };
    this.managerProxy = this.proxy.createProxy<WorkerManagerRPC>(NamespaceManager.workerManagerRpc(this.agentId), callOptions);
    this.sharedManagerProxy = this.proxy.createProxy<WorkerManagerRPC>(NamespaceManager.sharedWorkerManagerRpc(), callOptions);

    const rpcSubject = NamespaceManager.workerAgentRpc(this.agentId);
    this.closeHandler = await this.proxy.registerHandler(
      rpcSubject,
      {
        ping: () => this.ping(),
        restart: () => this.restart(),
        update: (version?: string) => this.update(version),
        openTunnel: (target: HostPort, token: string) => this.openTunnel(target, token),
      },
      { withoutDecorators: true },
    );

    this.unsubscribeSync = await this.proxy.subscribe(NamespaceManager.workerSync(this.agentId), (nudge?: WorkerNudge) => this.onNudge(nudge));
    process.on('message', this.onSupervisorMessage);

    this.healthyTimer = setTimeout(() => this.markHealthy(), HEALTHY_WITHOUT_MASTER_MS);

    if (this.state === 'pairing' || this.state === 'unpaired') {
      this.logger.warn(this.stateReason ?? `Not paired with ${this.master}`);
      this.notifyState();
      this.pairingWait.start(this.state);
      return;
    }

    // the graphics lookup can take seconds, the heartbeat carries it later
    collectSystemInfo(ConfigService.RUNNING_VERSION)
      .then((info) => {
        this.system = info;
      })
      .catch(() => {});

    this.sampleMetrics();
    this.metricsInterval = setInterval(() => this.sampleMetrics(), METRICS_INTERVAL_MS);

    this.syncCycle();
    this.syncInterval = setInterval(() => this.syncTick(), SYNC_INTERVAL_MS);
    this.leaseInterval = setInterval(() => this.leaseTick(), LEASE_TICK_MS);

    this.logger.log('WorkerAgent started and ready for commands');
  }

  public async close(reason: ShutdownReason = 'unknown'): Promise<void> {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;
    const previous = this.state;
    this.setState('closing');

    clearInterval(this.syncInterval);
    clearInterval(this.leaseInterval);
    clearInterval(this.metricsInterval);
    clearTimeout(this.healthyTimer);
    clearTimeout(this.reportTimer);
    clearTimeout(this.suspendTimer);
    clearTimeout(this.linkResumeTimer);
    clearInterval(this.linkHintTimer);
    clearInterval(this.codeWatchTimer);
    clearImmediate(this.spawnReport);
    this.pairingWait.stop();
    this.releaseSpawnWaiters();
    this.unsubscribeSync?.();
    process.off('message', this.onSupervisorMessage);

    // announced first, the master holds the workloads and keeps the stores for the last saves
    const linked = LEASED.has(previous) || previous === 'fenced';
    const announce = linked && this.mode === 'synced';
    const disconnectReason = DISCONNECT_REASON[reason];
    if (announce) {
      await this.publishDisconnect({ reason: disconnectReason, phase: 'stopping', expectBackMs: WORKER_EXPECT_BACK_MS[disconnectReason] });
    }

    await this.reconciler.close();
    await Promise.allSettled(Array.from(this.handlers.values(), (handler) => handler.close()));
    await this.watchdog.close();
    this.tunnels.close();

    // after the children are gone, an older master moves workloads on any disconnect
    if (announce) {
      await this.publishDisconnect({ reason: disconnectReason, phase: 'stopped' });
    } else if (linked) {
      await this.publishDisconnect({});
    }

    await this.statusFile.stop();
    await this.closeHandler?.();
    await this.proxy?.disconnect();

    this.logger.log('WorkerAgent shut down');
  }

  public async ping(): Promise<WorkerHealthInfo> {
    return {
      agentId: this.agentId,
      name: this.workerName,
      uptime: Date.now() - this.startTime,
      cameras: Array.from(this.handlers.values()).flatMap((h) => h.getActiveWorkIds()),
      capabilities: this.capabilities,
      version: ConfigService.RUNNING_VERSION,
      protocol: WORKER_PROTOCOL,
      bootId: this.boot,
      runId: this.answerRunId,
    };
  }

  public async restart(): Promise<void> {
    if (this.updating) {
      throw new Error('An update is running on this worker, it restarts by itself when the update is done');
    }

    this.logger.log('Restart requested by the master');
    // the answer to this call has to leave before the connection drops
    setTimeout(() => this.requestShutdown('restart'), 100);
  }

  public async update(version?: string): Promise<void> {
    if (!canRequestServerUpdate()) {
      throw new Error('This worker runs inside the desktop app and updates with it');
    }

    if (this.updating) {
      throw new Error('Update already in progress');
    }
    assertServerUpdateSpace(this.configService.HOME_PATH);

    this.updating = true;
    this.updateError = undefined;
    this.updatePhase = 'installing';
    this.updateTarget = version;
    this.lastUpdateResult = undefined;

    // an install takes minutes, answer now and report through the heartbeat
    this.runUpdate(version);
  }

  public openTunnel(target: HostPort, token: string): Promise<void> {
    return this.tunnels.dial(target, token);
  }

  private get workloadCount(): number {
    return Array.from(this.handlers.values()).reduce((count, handler) => count + handler.getActiveWorkIds().length, 0);
  }

  private get master(): string {
    return this.workersService.getWorkerConnection()?.master ?? this.configService.config.worker?.master ?? 'master';
  }

  private rotateBoot(): void {
    this.boot = randomUUID();
    this.prevBootIds = this.workersService.rotateBootIds(this.boot);
    setInstancePrefix(this.boot.slice(0, 8));
  }

  private setState(state: AgentState, reason?: string): void {
    if (this.state === state && this.stateReason === reason) {
      return;
    }

    this.state = state;
    this.stateReason = reason;
    this.notifyState();
  }

  private notifyState(): void {
    this.notifiedWorkloads = this.workloadCount;
    this.statusFile.write();
    sendIPCMessage({ type: 'WORKER_STATUS', state: this.state, master: this.master, reason: this.stateReason, workloads: this.notifiedWorkloads });
  }

  private markHealthy(): void {
    clearTimeout(this.healthyTimer);
    if (this.healthy || this.isClosed) {
      return;
    }

    this.healthy = true;
    sendIPCMessage({ type: 'HEALTHY', version: ConfigService.RUNNING_VERSION });
  }

  private announceMasterLink(runId?: string): void {
    this.proxy?.publish(NamespaceManager.workerLinkSubject(this.agentId), { connected: true, at: Date.now(), runId }).catch(() => {});
  }

  private applyUpdateChannel(channel?: 'latest' | 'beta'): void {
    if (!channel || channel === this.appliedUpdateChannel) return;

    this.appliedUpdateChannel = channel;
    announceUpdateChannel(channel === 'beta');
    requestAppUpdateCheck();
  }

  private applyUpdateTarget(target?: string): void {
    if (!IS_ELECTRON || !target || target === this.appCheckedFor || versionStanding(ConfigService.RUNNING_VERSION, target) !== 'behind') return;

    this.appCheckedFor = target;
    requestAppUpdateCheck();
  }

  private applyPurge(purges: PluginPurge[] = [], workloads: WorkerSyncResponse['workloads']): void {
    const listed = new Set(purges.map((purge) => purge.pluginName));
    for (const name of this.purged) {
      if (!listed.has(name)) this.purged.delete(name);
    }

    const wanted = new Set(
      workloads.filter((workload) => workload.capability === WorkerCapability.PluginHost).map((workload) => (workload.spec as RemotePluginConfig).pluginName),
    );
    for (const purge of purges) {
      if (wanted.has(purge.pluginName) || this.purged.has(purge.pluginName) || !this.pluginHostHandler) continue;
      this.purged.add(purge.pluginName);
      this.pluginHostHandler.purge(purge.pluginName, purge.storage).catch((error) => {
        this.purged.delete(purge.pluginName);
        this.logger.warn(`Could not remove plugin ${purge.pluginName}: ${error instanceof Error ? error.message : error}`);
      });
    }
  }

  private async readUpdateResult(): Promise<void> {
    try {
      const state = JSON.parse(await readFile(join(this.configService.HOME_PATH, 'server', UPDATE_STATE_FILE), 'utf8')) as UpdateState;
      if (state.at > Date.now() - UPDATE_RESULT_MAX_AGE_MS) {
        this.lastUpdateResult = { target: state.target, result: state.result, reason: state.reason };
      }
    } catch {
      // no file: older launcher, desktop app or no update yet
    }
  }

  private onNudge(nudge?: WorkerNudge): void {
    if (nudge?.notice === 'shutdown') {
      this.logger.debug(`Master run ${shortId(nudge.runId)} is shutting down`);
    }
    this.syncCycle();
  }

  private onLinkRejected(reason: string, kind: LeafRejection): void {
    if (this.isClosed || this.linkPaused || MUTE.has(this.state)) return;

    const now = Date.now();
    if (now - this.lastRejectionAt < REJECT_SPACING_MS) {
      return;
    }
    this.lastRejectionAt = now;
    this.rejections++;

    const cause = kind === 'auth' ? 'credentials' : 'certificate';
    if (this.rejections === 1) {
      this.logger.warn(
        kind === 'auth'
          ? `Master rejected this worker: ${reason}. Pair it again if it was removed there`
          : `Master certificate failed verification: ${reason}. Pair this worker again if the master's certificate changed`,
      );
    }

    if (this.rejections < REJECT_TO_STATE) {
      this.pauseLink(REJECT_SPACING_MS);
      return;
    }

    if (this.state !== 'rejected') {
      this.dials = 0;
      this.logger.warn(`Rejected by the master at ${this.master} (${cause}), trying again every ${REJECT_DIAL_MS[0] / 1000} s`);
      this.setState('rejected', cause);
      this.watchForNewCode();
      this.dropAll('requested');
    }
    this.dials++;
    if (this.dials === REJECT_DIAL_SLOW_AFTER) {
      this.logger.warn(`Still rejected by the master at ${this.master}, trying again every ${REJECT_DIAL_MS[1] / 1000} s`);
    }
    this.pauseLink(REJECT_DIAL_MS[this.dials >= REJECT_DIAL_SLOW_AFTER ? 1 : 0]);
  }

  private watchForNewCode(): void {
    clearInterval(this.codeWatchTimer);
    this.codeWatchTimer = setInterval(() => {
      if (this.isClosed || this.state !== 'rejected') {
        clearInterval(this.codeWatchTimer);
        return;
      }
      const code = this.configService.readWorkerConfig()?.pairingCode?.trim();
      if (code && !this.workersService.isCodeUsed(code)) {
        clearInterval(this.codeWatchTimer);
        this.logger.log('Found a new pairing code, restarting to pair with it');
        this.requestShutdown('restart');
      }
    }, UNPAIRED_POLL_MS);
  }

  private pauseLink(pauseMs: number): void {
    this.linkPaused = true;
    this.natsServer
      .pauseLeafRemotes(true)
      .then((paused) => {
        if (!paused || this.isClosed) {
          this.linkPaused = false;
          return;
        }

        this.logger.debug(`Next link attempt to the master in ${pauseMs / 1000} s`);
        clearTimeout(this.linkResumeTimer);
        this.linkResumeTimer = setTimeout(() => {
          this.linkPaused = false;
          if (this.state !== 'unpaired') {
            this.natsServer.pauseLeafRemotes(false).catch(() => {});
          }
        }, pauseMs);
      })
      .catch(() => {
        this.linkPaused = false;
      });
  }

  private followLinkHint(): void {
    const hintAt = Date.now();
    clearInterval(this.linkHintTimer);
    const attempt = (): void => {
      // a heartbeat from before the link came back waits for a lost answer, do not queue behind it
      this.syncCycle(Date.now() - this.lastSentAt >= LINK_HINT_RETRY_MS);
    };
    attempt();
    this.linkHintTimer = setInterval(() => {
      if (this.isClosed || (this.lastAnswerAt ?? 0) >= hintAt || Date.now() - hintAt > LINK_HINT_WINDOW_MS) {
        clearInterval(this.linkHintTimer);
        return;
      }
      attempt();
    }, LINK_HINT_RETRY_MS);
  }

  private async runUpdate(version = 'latest'): Promise<void> {
    // the desktop app installs what its feed offers
    const target = (IS_ELECTRON ? appUpdateState()?.version : undefined) ?? version;
    this.logger.log(`Updating to ${target}`);

    try {
      this.appliedUpdateChannel = version.includes('-beta') ? 'beta' : 'latest';
      announceUpdateChannel(version.includes('-beta'));
      const output = await requestServerUpdate(version);
      for await (const line of output) {
        this.logger.raw(line);
      }

      this.updatePhase = 'staged';
      this.logger.log(`Updated to ${target}, restarting`);
      this.requestShutdown('update');
    } catch (error) {
      this.updating = false;
      this.updatePhase = 'failed';
      this.updateError = error instanceof Error ? error.message : String(error);
      this.logger.error(`Update to ${target} failed: ${this.updateError}`);
    }
  }

  private heartbeatEvery(): number {
    switch (this.state) {
      case 'released':
        return RELEASED_HEARTBEAT_MS;
      case 'conflict':
        return REJECT_DIAL_MS[this.dials >= REJECT_DIAL_SLOW_AFTER ? 1 : 0];
      default:
        return SYNC_INTERVAL_MS;
    }
  }

  private syncTick(): void {
    if (Date.now() - this.lastSentAt >= this.heartbeatEvery() - SYNC_INTERVAL_MS / 2) {
      if (this.state === 'conflict') {
        this.dials++;
      }
      this.syncCycle();
    }
  }

  private async syncCycle(alongside = false): Promise<void> {
    if (this.isClosed || MUTE.has(this.state)) {
      return;
    }

    if (this.inFlight > 0 && !alongside) {
      this.syncQueued = true;
      return;
    }

    const seq = ++this.cycleSeq;
    this.inFlight++;
    const sent = stamp();
    this.lastSentAt = sent.wall;
    const heartbeat = this.buildHeartbeat();

    try {
      let response: WorkerSyncResponse;
      try {
        response = await this.sendHeartbeat(heartbeat);
      } catch {
        if (seq > this.answeredSeq) {
          this.onSilence();
        }
        return;
      }

      // an older heartbeat's answer carries an older desired state
      if (this.isClosed || MUTE.has(this.state) || seq < this.answeredSeq) {
        return;
      }

      this.answeredSeq = seq;
      if (response?.master) {
        this.onSyncedAnswer(response, response.master, sent);
      } else {
        this.onLegacyAnswer(response, sent);
      }

      for (const report of heartbeat.workloads ?? []) {
        if (this.tombstones.get(report.key) === report) {
          this.tombstones.delete(report.key);
        }
        if (report.instanceId) {
          this.spawnWaiters.get(report.instanceId)?.();
        }
      }
    } finally {
      this.inFlight--;

      if (this.syncQueued && this.inFlight === 0) {
        this.syncQueued = false;
        this.syncCycle();
      }
    }
  }

  private onLegacyAnswer(response: WorkerSyncResponse, sent: ReturnType<typeof stamp>): void {
    if (!Array.isArray(response?.workloads)) {
      this.logger.error('The master answered without a workload list, ignoring the answer');
      return;
    }

    const previous = this.state;
    if (this.mode === 'synced') {
      this.logger.warn('The master runs an older release now, restarting every workload once');
      this.reconciler.invalidate();
    }

    this.mode = 'legacy';
    this.answerRunId = undefined;
    this.appliedRun = undefined;
    // a hold belongs to the run that set it, an older master moves workloads after 15 s
    this.lease = { leaseMs: LEGACY_LEASE_MS, answeredSend: sent };

    this.confirmLink(previous, 'legacy', false);
    this.applyUpdateChannel(response.updateChannel);
    this.applyUpdateTarget(response.updateTarget);
    this.reconciler.submit({ workloads: response.workloads });
    this.armWatchdog();
  }

  private onSyncedAnswer(response: WorkerSyncResponse, master: MasterSyncInfo, sent: ReturnType<typeof stamp>): void {
    if (master.release) {
      this.release(master);
      return;
    }

    const previous = this.state;
    const newRun = this.answerRunId !== master.runId;
    this.mode = 'synced';
    this.answerRunId = master.runId;

    const hold = this.lease.hold?.runId === master.runId ? this.lease.hold : undefined;
    this.lease = { leaseMs: Math.min(LEASE_MAX_MS, Math.max(LEASE_MIN_MS, master.leaseMs)), answeredSend: sent, hold };
    if (master.stopping) {
      this.holdFor(master.runId, sent, master.stopping.untilMs);
    }

    const holds = master.holds ?? [];
    if (newRun && holds.length > 0 && previous !== 'linking') {
      this.logger.log(`Master run ${shortId(master.runId)} answers, holding ${holds.length} workloads until it has placed them`);
    }

    this.confirmLink(previous, 'synced', newRun);
    this.applyUpdateChannel(response.updateChannel);
    this.applyUpdateTarget(response.updateTarget);
    this.applyPurge(response.purge, response.workloads ?? []);
    this.reconciler.submit({ workloads: response.workloads ?? [], holds, seq: master.seq, runId: master.runId });
    this.armWatchdog();
  }

  private holdFor(runId: string, sent: ReturnType<typeof stamp>, untilMs: number): void {
    const candidate = { runId, sent, untilMs: Math.min(untilMs, NOTICE_CAP_MS) };
    const current = this.lease.hold;
    if (!current || candidate.untilMs - elapsed(candidate.sent) > current.untilMs - elapsed(current.sent)) {
      this.lease.hold = candidate;
    }

    if (this.noticeRunId !== runId) {
      this.noticeRunId = runId;
      const until = Date.now() + (leaseRemaining(this.lease) ?? 0);
      this.logger.log(`Master is restarting (run ${shortId(runId)}), keeping ${this.workloadCount} workloads until ${clockTime(until)}`);
    }
  }

  private confirmLink(previous: AgentState, next: 'synced' | 'legacy', newRun: boolean): void {
    const silentForMs = Date.now() - (this.lastAnswerAt ?? this.startTime);

    this.lastAnswerAt = Date.now();
    this.rejections = 0;
    this.dials = 0;
    this.silentWarned = false;
    this.nextMasterSearchAt = 0;
    this.masterSearchDelay = MASTER_SEARCH_MS[0];
    this.natsServer.linkConfirmed();
    this.setState(next);
    this.markHealthy();

    switch (previous) {
      case 'linking':
        this.logger.log(`Link to master ${this.master} is up${next === 'synced' ? ` (run ${shortId(this.answerRunId)})` : ', it runs an older release'}`);
        break;
      case 'silent':
        this.logger.log(`Master answers again after ${Math.round(silentForMs / 1000)} s, ${this.workloadCount} workloads kept`);
        // a new run places the workloads again, nothing to resync
        if (next === 'legacy' || !newRun) {
          this.announceMasterLink(this.answerRunId);
        }
        break;
      case 'fenced':
        this.logger.log(`Master answers again after ${Math.round(silentForMs / 1000)} s, starting the workloads it lists`);
        break;
      case 'released':
      case 'conflict':
      case 'rejected':
        this.logger.log(`Master ${this.master} accepts this worker again`);
        break;
    }
  }

  private onSilence(): void {
    if (this.state === 'synced' || this.state === 'legacy') {
      this.setState('silent');
    }
  }

  private leaseTick(): void {
    if (this.isClosed) {
      return;
    }

    const silentForMs = Date.now() - (this.lastAnswerAt ?? this.startTime);
    if (!this.silentWarned && silentForMs >= SILENT_WARN_MS && (this.state === 'linking' || this.state === 'silent')) {
      this.silentWarned = true;
      const remaining = leaseRemaining(this.lease);
      if (this.state === 'linking') {
        this.logger.warn(`No answer from master ${this.master} yet: ${this.natsServer.leaf.lastError ?? 'no link'}`);
      } else if (this.workloadCount > 0 && remaining !== undefined) {
        this.logger.warn(`No answer from the master for ${Math.round(silentForMs / 1000)} s, workloads stop at ${clockTime(Date.now() + remaining)} if this continues`);
      } else {
        this.logger.warn(`No answer from the master for ${Math.round(silentForMs / 1000)} s`);
      }
    }

    const mayLook = this.configService.config.mdns !== false && !this.masterSearch && Date.now() >= this.nextMasterSearchAt;
    if (mayLook && silentForMs >= MASTER_SEARCH_AFTER_MS && MASTER_LOST.has(this.state)) {
      this.masterSearch = this.searchMovedMaster().finally(() => (this.masterSearch = undefined));
    }

    if (!LEASED.has(this.state) || this.fencing) {
      return;
    }

    const remaining = leaseRemaining(this.lease);
    if (remaining !== undefined && remaining <= 0) {
      this.fence();
    }
  }

  private async searchMovedMaster(): Promise<void> {
    const connection = this.workersService.getWorkerConnection();
    try {
      const found = connection && (await findMovedMaster(connection));
      if (!found || this.isClosed || !MASTER_LOST.has(this.state)) return;

      this.workersService.saveWorkerConnection({ ...connection, ...found, configuredMaster: connection.configuredMaster ?? connection.master });
      this.logger.log(`Found the master at ${found.master}, it moved away from ${connection.master}. Restarting to connect there`);
      this.requestShutdown('restart');
    } catch (error) {
      this.logger.debug(`Looking for a moved master failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.nextMasterSearchAt = Date.now() + this.masterSearchDelay;
      this.masterSearchDelay = Math.min(this.masterSearchDelay * 2, MASTER_SEARCH_MS[1]);
    }
  }

  private async fence(): Promise<void> {
    const count = this.workloadCount;
    if (count > 0) {
      const silentForMs = Date.now() - (this.lastAnswerAt ?? this.startTime);
      this.logger.warn(`No answer from the master for ${Math.round(silentForMs / 1000)} s, stopping ${count} workloads`);
    }

    // the grace counts from the lease end, so the children's kill lands before the watchdog
    const late = Math.max(0, -(leaseRemaining(this.lease) ?? 0));
    this.fencing = this.dropAll('lease', Math.max(LEASE_CHILD_MIN_MS, LEASE_STOP_GRACE_MS - late - KILL_MARGIN_MS - LEASE_KILL_LEAD_MS));
    try {
      await this.fencing;
    } finally {
      this.fencing = undefined;
    }

    // an answer during the stop renewed the lease
    const remaining = leaseRemaining(this.lease);
    if (LEASED.has(this.state) && remaining !== undefined && remaining <= 0) {
      this.setState('fenced');
      this.syncCycle(true);
    }
  }

  private async dropAll(reason: StopReason, budgetMs?: number): Promise<void> {
    this.releaseSpawnWaiters();
    await this.reconciler.reset(async () => {
      const stopped = await Promise.all(Array.from(this.handlers, async ([capability, handler]) => [capability, await handler.stopAll(reason, budgetMs)] as const));
      if (reason !== 'lease') {
        return;
      }
      for (const [capability, statuses] of stopped) {
        for (const [id, status] of statuses) {
          const key = workloadKey(capability, id);
          this.tombstones.set(key, this.report(key, status));
        }
      }
    });
    this.watchdog.disarm();
  }

  private release(master: MasterSyncInfo): void {
    const reason = master.release!.reason;
    const target: AgentState = reason === 'removed' ? 'unpaired' : reason === 'conflict' ? 'conflict' : 'released';
    this.answerRunId = master.runId;
    this.lease = { leaseMs: this.lease.leaseMs };

    if (this.releasing) {
      return;
    }
    if (this.state === target) {
      const changed = this.appliedRun?.runId !== master.runId || this.appliedRun.seq !== master.seq;
      this.appliedRun = { runId: master.runId, seq: master.seq };
      // the master waits for this seq before it moves the released work
      if (changed) {
        this.reportSoon();
      } else if (target === 'conflict' && !this.linkPaused) {
        // both copies share one identity and push each other's link out, keep it down between heartbeats
        this.pauseLink(this.heartbeatEvery() - SYNC_INTERVAL_MS);
      }
      return;
    }

    const count = this.workloadCount;
    switch (reason) {
      case 'removed':
        this.logger.warn(`Removed by the master at ${this.master}, stopping ${count} workloads. Pair again with a new code.`);
        break;
      case 'conflict':
        this.logger.error('Another machine uses the identity of this worker, the master stopped both. Remove one of them on the master and pair it again.');
        break;
      case 'incompatible':
        this.logger.error(`The master does not support this worker's protocol, stopping ${count} workloads. Update the master.`);
        break;
      default:
        this.logger.warn(`The master has workers disabled, stopping ${count} workloads`);
    }

    if (target !== 'unpaired') {
      this.dials = 0;
      this.setState(target, reason);
    }

    this.releasing = this.dropAll('requested')
      .then(async () => {
        this.appliedRun = { runId: master.runId, seq: master.seq };
        if (target !== 'unpaired') {
          this.syncCycle(true);
          return;
        }
        // the empty report confirms the release
        await this.syncCycle(true);
        this.workersService.markUnpaired(reason);
        this.setState('unpaired', `Removed by the master at ${this.master}. Pair again with a new code.`);
        clearInterval(this.syncInterval);
        clearInterval(this.leaseInterval);
        await this.natsServer.pauseLeafRemotes(true).catch(() => false);
        this.pairingWait.start('unpaired');
      })
      .finally(() => {
        this.releasing = undefined;
      });
  }

  private onPairing(result: PairingState): void {
    if (this.isClosed) {
      return;
    }
    if (result.state === 'paired') {
      this.pairingWait.stop();
      this.logger.log(`Paired with ${this.master}, restarting to connect`);
      this.requestShutdown('restart');
      return;
    }
    if (result.reason !== this.stateReason) {
      this.logger.warn(result.reason);
    }
    this.setState(result.state, result.reason);
  }

  private async suspend(): Promise<void> {
    if (this.isClosed || this.state === 'suspended' || this.state === 'unpaired' || this.state === 'pairing') {
      return;
    }

    const announce = this.mode === 'synced' && LEASED.has(this.state);
    this.logger.log(`The system goes to sleep, stopping ${this.workloadCount} workloads`);
    this.setState('suspended');
    clearTimeout(this.reportTimer);

    await this.dropAll('lease', LEASE_STOP_GRACE_MS);
    this.tombstones.clear();
    if (announce) {
      await this.publishDisconnect({ reason: 'suspend', phase: 'stopped' });
    }

    // macOS can stay awake after a suspend event, the timer only runs while awake
    clearTimeout(this.suspendTimer);
    this.suspendTimer = setTimeout(() => this.resume('did not sleep'), SUSPEND_MAX_MS);
  }

  private resume(why: string): void {
    if (this.isClosed || this.state !== 'suspended') {
      return;
    }

    clearTimeout(this.suspendTimer);
    this.rotateBoot();
    this.lease = { leaseMs: this.lease.leaseMs };
    this.answerRunId = undefined;
    this.appliedRun = undefined;
    this.setState('linking');
    this.logger.log(`The system ${why}, asking the master for work as boot ${shortId(this.boot)}`);
    this.syncCycle(true);
  }

  private onApplied(desired: DesiredState): void {
    if (desired.runId !== undefined && desired.seq !== undefined) {
      this.appliedRun = { runId: desired.runId, seq: desired.seq };
    }
    this.reportSoon();
  }

  private onWorkloadChange(): void {
    this.reportSoon();
    // the desktop app keeps the system awake while there is work
    if (this.workloadCount !== this.notifiedWorkloads) {
      this.notifyState();
    }
  }

  private reportSoon(): void {
    if (this.reportTimer || MUTE.has(this.state)) {
      return;
    }
    this.reportTimer = setTimeout(() => {
      this.reportTimer = undefined;
      this.armWatchdog();
      this.syncCycle();
    }, REPORT_DEBOUNCE_MS);
  }

  private waitForSpawnReport(instanceId: string): Promise<void> {
    if (this.mode !== 'synced' || this.state !== 'synced') {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        this.spawnWaiters.delete(instanceId);
        resolve();
      };
      const timer = setTimeout(done, SPAWN_REPORT_WAIT_MS);
      this.spawnWaiters.set(instanceId, done);

      // one heartbeat per spawn pass, sent beside a running one
      this.spawnReport ??= setImmediate(() => {
        this.spawnReport = undefined;
        this.syncCycle(true);
      });
    });
  }

  private releaseSpawnWaiters(): void {
    for (const done of [...this.spawnWaiters.values()]) {
      done();
    }
  }

  private armWatchdog(): void {
    const remaining = leaseRemaining(this.lease);
    const groups = this.processRefs().map((ref) => ({ pid: ref.pid, pgid: process.platform === 'win32' ? undefined : ref.pid }));
    if (remaining === undefined || groups.length === 0 || !LEASED.has(this.state)) {
      this.watchdog.disarm();
      return;
    }
    this.watchdog.arm(Date.now() + remaining, groups);
  }

  private async publishDisconnect(payload: Omit<WorkerDisconnect, 'agentId'>): Promise<void> {
    const subject = this.sharedMaster ? NamespaceManager.sharedWorkerDisconnect() : NamespaceManager.workerDisconnect(this.agentId);
    // an older master only reads the agent id
    const body: WorkerDisconnect = payload.reason ? { agentId: this.agentId, bootId: this.boot, ...payload } : { agentId: this.agentId };
    await this.proxy?.publish(subject, body).catch(() => {});
  }

  private async sendHeartbeat(heartbeat: WorkerHeartbeat): Promise<WorkerSyncResponse> {
    try {
      const response = await this.managerProxy.heartbeat(heartbeat);
      this.sharedMaster = false;
      return response;
    } catch (error) {
      if (isNoRespondersError(error) || (isRPCError(error) && error.code === ERROR_CODES.NOT_FOUND)) {
        const response = await this.sharedManagerProxy.heartbeat(heartbeat);
        this.sharedMaster = true;
        return response;
      }
      throw error;
    }
  }

  private leaseInfo(): WorkerLease | undefined {
    switch (this.state) {
      case 'synced':
      case 'legacy':
        return { state: 'held', expiresInMs: leaseRemaining(this.lease) };
      case 'silent':
        return { state: 'silent', expiresInMs: leaseRemaining(this.lease) };
      case 'fenced':
      case 'released':
      case 'conflict':
      case 'rejected':
        return { state: this.state };
      default:
        return undefined;
    }
  }

  private report(key: string, status: HostedStatus): WorkloadReport {
    const bound = this.reconciler.binding(key);
    return {
      key,
      gen: this.reconciler.gen(key),
      revision: this.reconciler.revision(key) ?? 0,
      phase: status.phase,
      since: status.since,
      instanceId: status.instanceId,
      pid: status.pid,
      handshake: bound && bound.instanceId === status.instanceId ? bound.handshake : undefined,
      restarts: status.restarts,
      nextRestartAt: status.nextRestartAt,
      version: status.version,
      linked: status.linked,
      install: status.install,
      lastExit: status.lastExit,
      failure: status.failure,
    };
  }

  private buildReports(): WorkloadReport[] {
    const reports: WorkloadReport[] = [];
    for (const [capability, handler] of this.handlers) {
      for (const id of handler.getActiveWorkIds()) {
        const status = handler.status(id);
        if (status) {
          const key = workloadKey(capability, id);
          this.tombstones.delete(key);
          reports.push(this.report(key, status));
        }
      }
    }
    return [...reports, ...this.tombstones.values()];
  }

  private buildHeartbeat(): WorkerHeartbeat {
    return {
      agentId: this.agentId,
      name: this.workerName,
      cameras: Array.from(this.handlers.values()).flatMap((h) => h.getActiveWorkIds()),
      uptime: Date.now() - this.startTime,
      capabilities: this.capabilities,
      version: ConfigService.RUNNING_VERSION,
      platform: hostPlatform(),
      addresses: fetchViableNetworkAddresses(),
      system: this.system,
      pid: process.pid,
      cpuLoad: this.cpuLoad,
      memLoad: this.memLoad,
      plugins: this.pluginHostHandler?.getPluginStatuses(),
      processes: this.processSamples,
      update: {
        updatable: canRequestServerUpdate(),
        updating: this.updating,
        error: this.updateError,
        phase: this.updatePhase,
        target: this.updateTarget,
        desktop: IS_ELECTRON,
        lastResult: this.lastUpdateResult,
      },
      appVersion: process.env.CAMERA_UI_APP_VERSION,
      bootId: this.boot,
      prevBootIds: this.prevBootIds,
      protocol: WORKER_PROTOCOL,
      runId: this.appliedRun?.runId,
      appliedSeq: this.appliedRun?.seq,
      reportSeq: ++this.reportSeq,
      workloads: this.buildReports(),
      lease: this.leaseInfo(),
      pluginProtocol: { level: PROTOCOL_LEVEL, min: MIN_SUPPORTED_PROTOCOL_LEVEL },
    };
  }

  private processRefs(): WorkerProcessRef[] {
    return Array.from(this.handlers.values()).flatMap((handler) => handler.getActiveProcesses());
  }

  private async sampleMetrics(): Promise<void> {
    try {
      const owned = new Map<number, WorkerProcessRef>();
      for (const ref of this.processRefs()) {
        owned.set(ref.pid, ref);
      }

      const all = await processes();

      let cpu = 0;
      let mem = 0;
      const samples: WorkerProcessSample[] = [];

      for (const proc of all.list) {
        const ref = owned.get(proc.pid);
        if (!ref && proc.pid !== process.pid) {
          continue;
        }

        cpu += proc.cpu || 0;
        mem += proc.mem || 0;

        if (ref) {
          samples.push({ ...ref, cpuLoad: (proc.cpu || 0).toFixed(2), memLoad: (proc.mem || 0).toFixed(2) });
        }
      }

      this.cpuLoad = Math.min(cpu, 100).toFixed(2);
      this.memLoad = Math.min(mem, 100).toFixed(2);
      this.processSamples = samples;
    } catch {
      // keep last sample
    }
  }

  private forwardLog(entry: LogEntry): void {
    try {
      this.proxy?.publish(this.sharedMaster ? NamespaceManager.sharedWorkerLogs() : NamespaceManager.workerLogs(this.agentId), entry).catch(() => {});
    } catch {
      // not connected, the line stays in the local log
    }
  }
}
