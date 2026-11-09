import { isEqual, sleep } from '@camera.ui/common/utils';
import { ERROR_CODES, isNoRespondersError, isRPCError } from '@camera.ui/rpc';
import { SensorType } from '@camera.ui/sdk';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { CamerasService } from '../api/services/cameras.service.js';
import { PluginsService } from '../api/services/plugins.service.js';
import { updatesService } from '../api/services/updates.service.js';
import { WorkersService } from '../api/services/workers.service.js';
import { inject, provide, tryInject } from '../container.js';
import { NamespaceManager, SUBJECT_TOKEN } from '../rpc/namespaces.js';
import { DETECTION_SENSOR_TYPES, getAssignmentKey } from '../sensors/types.js';
import { ConfigService } from '../services/config/index.js';
import { setInstancePrefix } from '../utils/instance-id.js';
import { describePlatformRequirement, isPlatformCompatible } from '../utils/platform.js';
import { clockTime, shortId } from './lifecycle/format.js';
import { graceRest, hostClock, shutdownRecord } from './lifecycle/grace.js';
import { answerKind, expectedPresence, isPlaceable, presenceDeadline, reducePresence } from './lifecycle/presence.js';
import {
  FAILOVER_AFTER_MS,
  HOLD_MAX_MS,
  INSTALL_CAP_MS,
  LEASE_MS,
  MASTER_EXPECT_BACK_MS,
  NOTICE_SYNC_WAIT_MS,
  OUTDATED_PROBE_MS,
  PREPARE_SILENT_MS,
  PRESENCE_TICK_MS,
  REHOME_FLAP_WINDOW_MS,
  REHOME_STABLE_MAX_MS,
  REHOME_STABLE_MS,
  RELEASE_ACK_WARN_MS,
  scaled,
  SELF_STALL_MS,
} from './lifecycle/timing.js';
import { versionStanding } from './lifecycle/update.js';
import { WorkerNotices } from './notices.js';
import { hostPort, loopbackTarget, StreamTunnels, withHostPort } from './stream-tunnel.js';
import { MIN_WORKER_PROTOCOL, parseWorkloadKey, WORKER_PROTOCOL, WorkerCapability, workloadKey } from './types.js';
import { WorkerUpdates } from './updates.js';

import type { LogEntry, Logger } from '@camera.ui/common/logger';
import type { ShutdownReason } from '@camera.ui/common/node';
import type { Promisify } from '@camera.ui/rpc';
import type { DBCamera, DBWorkerLastShutdown } from '../api/database/types.js';
import type { ServerNamespace } from '../api/websocket/nsp/server.js';
import type { WorkersNamespace } from '../api/websocket/nsp/workers.js';
import type { ProxyServer } from '../rpc/index.js';
import type { SystemInfo } from '../utils/system-info.js';
import type { HostClock } from './lifecycle/grace.js';
import type { PlacementEvent } from './lifecycle/placement.js';
import type { Presence, PresenceEffect, PresenceEvent } from './lifecycle/presence.js';
import type { PlacementDecision, PlacementOwner } from './lifecycle/remote-placement.js';
import type { WorkerUpdateResult } from './updates.js';
import type {
  CapabilitySpec,
  CrossHostFrameLink,
  HostPort,
  KnownWorker,
  MasterSyncInfo,
  PluginBuild,
  PluginInstallReport,
  WorkerAgentRPC,
  WorkerDisconnect,
  WorkerHealthInfo,
  WorkerHeartbeat,
  WorkerInfo,
  WorkerNudge,
  WorkerProcessSample,
  WorkerState,
  WorkerSyncResponse,
  WorkloadLive,
  WorkloadReport,
  WorkloadSpec,
} from './types.js';

const WORKER_UPDATE_INTERVAL_MS = 1_000;
const WAIT_POLL_MS = 100;
const TUNNEL_TIMEOUT_MS = 10_000;
const PROBE_RELEASE_MS = scaled(5000);
const REMOVE_DRAIN_MS = scaled(60_000);
const LEGACY_RESTART_MS = scaled(120_000);
const LEGACY_RESTART_POLL_MS = scaled(2000);

interface Desired {
  agentId: string;
  workload: WorkloadSpec;
  seq: number;
}

interface Release {
  from: string;
  seq: number;
  at: number;
  safeAt?: number;
  probe?: boolean;
}

interface AgentRelease {
  reason: 'removed' | 'disabled';
  seq: number;
  acked: boolean;
}

interface Reports {
  bootId?: string;
  reportSeq: number;
  runId?: string;
  appliedSeq?: number;
  workloads: Map<string, WorkloadReport>;
}

interface Rehome {
  onlineSince?: number;
  offlines: number[];
}

interface Shutdown {
  notified: Set<string>;
  until: Map<string, number>;
  answered: Set<string>;
  removeAll: boolean;
}

interface Refusal {
  reason: string;
  wait: boolean;
}

export class WorkerRequestError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

function mono(): number {
  return performance.now();
}

function feedsFrames(camera: DBCamera, type: SensorType, pluginId: string): boolean {
  if (!DETECTION_SENSOR_TYPES.has(type)) return false;
  const keys = type === SensorType.Object ? ['object', 'objectAssist'] : [getAssignmentKey(type)];
  return keys.some((key) => {
    const assignment = camera.assignments?.[key as keyof typeof camera.assignments];
    return Array.isArray(assignment) ? assignment.some((plugin) => plugin.id === pluginId) : assignment?.id === pluginId;
  });
}

function isLive(report: WorkloadReport): boolean {
  return report.phase !== 'stopped' && report.phase !== 'failed';
}

function describeFallback(workerOnly: boolean | undefined): string {
  if (workerOnly === undefined) return '';
  return workerOnly ? ', never on this server' : ', on this server while the worker is away';
}

export class WorkerManager {
  public readonly runId = randomUUID();
  public readonly tunnels: StreamTunnels;
  public readonly updates: WorkerUpdates;

  private readonly logger: Logger;
  private readonly configService: ConfigService;
  private readonly camerasService: CamerasService;
  private readonly workersService: WorkersService;
  private readonly proxyServer: ProxyServer;

  private workers = new Map<string, WorkerInfo>();
  private presence = new Map<string, Presence>();
  private reports = new Map<string, Reports>();
  private pluginProtocols = new Map<string, { level: number; min: number }>();
  private desired = new Map<string, Desired>();
  private seqs = new Map<string, number>();
  private holds = new Map<string, Set<string>>();
  private releases = new Map<string, Release>();
  private releaseWrites: Promise<void> = Promise.resolve();
  private agentReleases = new Map<string, AgentRelease>();
  private purges = new Map<string, Map<string, { storage: boolean; seq: number }>>();
  private owners = new Map<string, PlacementOwner>();
  private everDesired = new Set<string>();
  private failures = new Map<string, string>();
  private answered = new Set<string>();
  private rehome = new Map<string, Rehome>();
  private notices = new WorkerNotices();
  private shutdown?: Shutdown;

  private listeners = new Map<string, Promise<() => Promise<void>>>();
  private probing = new Set<string>();
  private legacyAgents = new Set<string>();
  private legacyAttempted = new Set<string>();
  private legacyRestarting = new Set<string>();
  private probeOkAt = new Map<string, number>();
  private probeAt = new Map<string, number>();
  private tickInterval?: NodeJS.Timeout;
  private lastTickAt?: number;
  private probeInterval?: NodeJS.Timeout;
  private updateTimers = new Map<string, NodeJS.Timeout>();
  private lastUpdateAt = new Map<string, number>();
  private genCounter = 0;
  private revision = 0;
  private readyAt?: number;
  private holdsExpired = false;
  private booted = false;
  private addressWarned = false;
  private tunnelWarned = new Set<string>();
  private active = false;

  constructor() {
    provide('workerManager', this);

    this.configService = inject('configService');
    this.proxyServer = inject('proxy');

    this.logger = inject('logger').createSystemLogger('WorkerManager', 'workers');
    this.tunnels = new StreamTunnels(this.logger);
    this.camerasService = new CamerasService();
    this.workersService = new WorkersService();
    this.updates = new WorkerUpdates(
      this.workersService,
      this.logger,
      (agentId) => this.nameOf(agentId),
      (result) => this.onUpdateResult(result),
    );

    // local instance ids carry the run, a worker's carry its boot
    setInstancePrefix(`m${this.runId.slice(0, 8)}`);
  }

  public isEnabled(): boolean {
    return this.active;
  }

  public async start(): Promise<void> {
    if (this.configService.config.workers?.enabled) {
      await this.enable(false);
    }
  }

  public markReady(): void {
    this.readyAt ??= mono();
  }

  public async enable(reconcileAcceptor = true): Promise<void> {
    if (this.active) {
      return;
    }
    if (!this.proxyServer.proxy) {
      throw new Error('WorkerManager enabled before the proxy was initialized');
    }

    this.logger.log('Enabling WorkerManager');
    this.active = true;

    const now = mono();
    const boot = !this.booted;
    this.booted = true;
    const clock = hostClock();
    const record = boot ? this.workersService.getLastShutdown() : undefined;
    const known = new Map(this.workersService.listKnownWorkers().map((worker) => [worker.agentId, worker]));
    const agentIds = new Set([...known.keys(), ...this.workersService.listCredentials().map(({ agentId }) => agentId)]);
    for (const agentId of agentIds) {
      const worker = known.get(agentId);
      this.seedInfo(agentId, worker?.displayName ?? worker?.name ?? agentId, worker);
    }
    if (boot) {
      for (const { agentId, target } of this.updates.load()) {
        updatesService().notifyWorkerUpdate(agentId, this.nameOf(agentId), target);
      }
    }

    for (const agentId of agentIds) {
      const worker = known.get(agentId);
      const existing = this.presence.get(agentId);
      if (existing) {
        this.step(agentId, { type: 'enable', now });
        continue;
      }

      const rest = boot ? Math.max(graceRest(agentId, worker?.lastSeen, record, clock), this.updates.holdMs(agentId)) : 0;
      this.presence.set(agentId, expectedPresence(now, now + rest));
      this.syncInfo(agentId);
      if (rest > 0 && this.assignedKeys(agentId).length > 0) {
        this.logger.log(`Waiting for worker ${this.nameOf(agentId)} until ${clockTime(Date.now() + rest)} before running its workloads here`);
      }
    }

    if (boot) {
      this.restoreReleases(record, clock, now);
      this.buildHolds();
    }

    for (const agentId of agentIds) {
      await this.listen(agentId);
    }

    if (!this.tickInterval) {
      this.lastTickAt = mono();
      this.tickInterval = setInterval(() => this.tick(), PRESENCE_TICK_MS);
    }
    this.probeInterval = setInterval(() => this.probeOutdatedWorkers(), OUTDATED_PROBE_MS);
    this.probeOutdatedWorkers();

    if (reconcileAcceptor) {
      await this.proxyServer.applyLeafNodeAuth();
    }

    this.logger.log('WorkerManager enabled');
  }

  public async disable(): Promise<void> {
    if (!this.active) {
      return;
    }

    this.logger.log('Disabling WorkerManager');
    this.active = false;
    const now = mono();

    // consumers on a worker release there first, the local start waits for that
    for (const owner of this.owners.values()) {
      if ((owner.host && owner.host !== 'master') || owner.waitingFor) {
        owner.reconsider('workers are disabled');
      }
    }
    for (const [agentId, keys] of this.holds) {
      for (const key of keys) {
        this.openRelease(key, agentId);
      }
    }

    const releasing: string[] = [];
    for (const [agentId, presence] of this.presence) {
      if (presence.state === 'online' || presence.state === 'unreachable' || presence.state === 'restarting') {
        this.agentReleases.set(agentId, { reason: 'disabled', seq: this.bumpSeq(agentId), acked: false });
        this.step(agentId, { type: 'release', now, reason: 'disabled' });
        this.nudge(agentId);
        releasing.push(agentId);
      }
    }
    await this.until(() => releasing.every((agentId) => this.agentReleases.get(agentId)?.acked), RELEASE_ACK_WARN_MS);

    for (const [agentId, presence] of this.presence) {
      this.settleReleasesFrom(agentId, presence, this.agentReleases.get(agentId)?.acked === true);
      this.agentReleases.delete(agentId);
      this.step(agentId, { type: 'released', now: mono() });
    }
    this.holds.clear();
    this.notices.clear();

    clearInterval(this.probeInterval);
    this.probeInterval = undefined;
    await Promise.all(Array.from(this.listeners.keys()).map((agentId) => this.stopListening(agentId)));

    await this.proxyServer.applyLeafNodeAuth();

    this.logger.log('WorkerManager disabled');
  }

  public async announceShutdown(reason: ShutdownReason): Promise<void> {
    if (!this.active || this.shutdown) {
      return;
    }

    const now = mono();
    const expectBackMs = reason === 'update' ? MASTER_EXPECT_BACK_MS.update : reason === 'stop' || reason === 'reset' ? 0 : MASTER_EXPECT_BACK_MS.restart;
    const notified: string[] = [];
    const restarting = new Map<string, number>();
    const unanswered: string[] = [];
    for (const [agentId, presence] of this.presence) {
      if (presence.state === 'online') {
        notified.push(agentId);
      } else if (presence.state === 'restarting' && presence.holdUntil !== undefined) {
        restarting.set(agentId, presence.holdUntil - now);
      }
      if (!this.answered.has(agentId)) {
        unanswered.push(agentId);
      }
    }

    this.shutdown = {
      notified: new Set(notified),
      until: new Map(notified.map((agentId) => [agentId, now + expectBackMs + LEASE_MS])),
      answered: new Set(),
      removeAll: reason === 'reset',
    };

    const record = shutdownRecord({
      runId: this.runId,
      reason,
      clock: hostClock(),
      expectBackMs,
      notified,
      restarting,
      unanswered,
      previous: this.workersService.getLastShutdown(),
    });
    await this.workersService.saveLastShutdown(record).catch((error) => this.logger.error('Failed to store the worker holds:', error));

    for (const agentId of notified) {
      this.nudge(agentId, { notice: 'shutdown' });
    }
    if (notified.length > 0) {
      const what = reason === 'reset' ? 'to unpair' : `to keep their workloads for up to ${Math.round((expectBackMs + LEASE_MS) / 1000)} s`;
      this.logger.log(`Shutting down: told ${notified.length} workers ${what}`);
    }
  }

  public async stop(): Promise<void> {
    const shutdown = this.shutdown;
    if (shutdown) {
      await this.until(() => Array.from(shutdown.notified).every((agentId) => shutdown.answered.has(agentId)), NOTICE_SYNC_WAIT_MS);
    }

    clearInterval(this.tickInterval);
    this.tickInterval = undefined;
    clearInterval(this.probeInterval);
    this.probeInterval = undefined;

    await Promise.all(Array.from(this.listeners.keys()).map((agentId) => this.stopListening(agentId)));
    this.updateTimers.forEach((timer) => clearTimeout(timer));
    this.updateTimers.clear();
    this.tunnels.close();
    this.active = false;
  }

  public getWorkers(): WorkerInfo[] {
    const target = this.updateTarget();
    return Array.from(this.workers.values(), (worker) => this.withStanding(worker, target));
  }

  public isWorkerOnline(agentId: string): boolean {
    return this.presence.get(agentId)?.state === 'online';
  }

  public isWorkerKnown(agentId: string): boolean {
    return this.workers.has(agentId);
  }

  public getAssignment(cameraId: string): string | undefined {
    return this.camerasService.findById(cameraId)?.workerAgentId;
  }

  public isAssignedToWorker(cameraId: string): boolean {
    return this.getAssignment(cameraId) !== undefined;
  }

  public getPluginAssignment(pluginName: string): string | undefined {
    return new PluginsService().getPluginDbByName(pluginName)?.workerAgentId;
  }

  public getCrossHostFrameLinks(): CrossHostFrameLink[] {
    const registry = inject('sensorRegistry');
    const pluginsService = new PluginsService();
    const links = new Map<string, CrossHostFrameLink>();
    // without workers.address every camera decodes here
    const camerasLeave = Boolean(this.configService.config.workers?.address);

    for (const camera of this.camerasService.list()) {
      const cameraWorker = camerasLeave ? camera.workerAgentId : undefined;
      for (const sensor of registry.getAllSensors({ connectedOnly: true, cameraId: camera._id })) {
        if (!sensor.data.requiresFrames || !feedsFrames(camera, sensor.type, sensor.data.pluginId)) continue;
        const plugin = pluginsService.getPluginDbById(sensor.data.pluginId);
        if (!plugin || plugin.workerAgentId === cameraWorker) continue;

        const key = `${camera._id}/${plugin.pluginName}`;
        let link = links.get(key);
        if (!link) {
          link = {
            cameraId: camera._id,
            cameraName: camera.name,
            cameraWorker,
            pluginName: plugin.pluginName,
            pluginWorker: plugin.workerAgentId,
            sensorTypes: [],
          };
          links.set(key, link);
        }
        link.sensorTypes.push(sensor.type);
      }
    }

    return Array.from(links.values());
  }

  public getRemoteProcess(capability: WorkerCapability, id: string): { worker: string; system?: SystemInfo; sample?: WorkerProcessSample } | undefined {
    const host = this.owners.get(workloadKey(capability, id))?.host;
    const worker = host && host !== 'master' ? this.workers.get(host) : undefined;
    if (!worker) {
      return undefined;
    }

    return {
      worker: worker.name,
      system: worker.system,
      sample: worker.online ? worker.processes?.find((process) => process.capability === capability && process.id === id) : undefined,
    };
  }

  public async streamUrlFromHere(pluginId: string | undefined, url: string): Promise<string> {
    const target = loopbackTarget(url);
    if (!target || !pluginId) {
      return url;
    }

    const plugins = new PluginsService();
    const pluginProcess = plugins.getPluginProcessById(pluginId);
    // until placed again, the instance its worker kept answers
    const agentId = pluginProcess?.isLocal ? undefined : (pluginProcess?.workerAgentId ?? plugins.getPluginDbById(pluginId)?.workerAgentId);
    if (!agentId) {
      return url;
    }

    const local = await this.tunnels.listen(`${agentId}|${hostPort(target)}`, target, `worker ${this.nameOf(agentId)}`, (to, token) =>
      this.openTunnel(agentId, to, token),
    );
    return withHostPort(url, local);
  }

  public nameOf(agentId: string): string {
    return this.workers.get(agentId)?.name ?? agentId;
  }

  public async renameWorker(agentId: string, name: string): Promise<void> {
    await this.workersService.renameWorker(agentId, name);

    const worker = this.workers.get(agentId);
    if (worker) {
      worker.name = name;
      this.emitWorkerUpdate(worker);
    }
  }

  public async setServerAddresses(agentId: string, serverAddresses: string[]): Promise<void> {
    const previous = this.workersService.getWorkerServerAddresses(agentId);
    await this.workersService.setWorkerServerAddresses(agentId, serverAddresses);

    const worker = this.workers.get(agentId);
    if (worker) {
      worker.serverAddresses = serverAddresses;
      this.emitWorkerUpdate(worker);
    }

    if (isEqual(previous, serverAddresses, true)) return;

    for (const [key, owner] of this.owners) {
      if (owner.host === agentId && parseWorkloadKey(key)?.capability === WorkerCapability.PluginHost) {
        this.logger.log(`Server addresses of worker ${this.nameOf(agentId)} changed, restarting ${owner.label}`);
        owner.restart('the server addresses changed');
      }
    }
  }

  public async preparePlugin(pluginName: string, build: PluginBuild): Promise<void> {
    const key = workloadKey(WorkerCapability.PluginHost, pluginName);
    const desired = this.desired.get(key);
    const report = desired ? this.reports.get(desired.agentId)?.workloads.get(key) : undefined;
    // not running there yet, it starts with the new version anyway
    if (!desired || report?.phase !== 'running' || report.version === build.version) {
      return;
    }

    const { agentId } = desired;
    const name = this.nameOf(agentId);
    desired.workload.live = { ...desired.workload.live, prepare: build };
    this.bumpSeq(agentId);
    this.nudge(agentId);
    this.logger.log(`Worker ${name} installs ${pluginName}@${build.version} beside the running ${report.version}`);

    const install = (): PluginInstallReport | undefined => {
      const current = this.reports.get(agentId)?.workloads.get(key)?.install;
      return current?.version === build.version ? current : undefined;
    };
    // an older agent never reports the install and installs at the switch
    let heard = mono();
    const settled = await this.until(() => {
      const step = install()?.step;
      if (step === 'staged' || step === 'failed') return true;
      if (step) heard = mono();
      return this.desired.get(key)?.agentId !== agentId || mono() - heard >= PREPARE_SILENT_MS;
    }, INSTALL_CAP_MS);

    const result = install();
    if (result?.step === 'failed') {
      this.logger.warn(`Worker ${name} could not install ${pluginName}@${build.version} ahead: ${result.error}`);
    } else if (!settled) {
      this.logger.warn(`Worker ${name} did not finish installing ${pluginName}@${build.version} ahead, switching anyway`);
    }
  }

  public async waitPluginVersion(pluginName: string, version: string): Promise<string | undefined> {
    const key = workloadKey(WorkerCapability.PluginHost, pluginName);
    let reason: string | undefined;
    const settled = await this.until(() => {
      const desired = this.desired.get(key);
      if (!desired) {
        reason = 'it left its worker';
        return true;
      }
      const report = this.reports.get(desired.agentId)?.workloads.get(key);
      if (report?.failure?.terminal) {
        reason = report.failure.message;
        return true;
      }
      return report?.phase === 'running' && report.version === version && desired.workload.bound?.instanceId === report.instanceId;
    }, INSTALL_CAP_MS);
    return settled ? reason : `it did not start within ${Math.round(INSTALL_CAP_MS / 60_000)} min`;
  }

  public pluginApiIssue(agentId: string, protocolLevel: number | undefined): string | undefined {
    const range = this.pluginProtocols.get(agentId);
    if (typeof protocolLevel !== 'number' || !range || (protocolLevel >= range.min && protocolLevel <= range.level)) {
      return undefined;
    }
    const fix = protocolLevel > range.level ? 'Update the worker first.' : 'Pick a newer plugin version.';
    return `Worker ${this.nameOf(agentId)} runs plugin API ${range.min} to ${range.level}, this plugin version needs ${protocolLevel}. ${fix}`;
  }

  public purgePlugin(agentId: string, pluginName: string, storage: boolean): void {
    const purges = this.purges.get(agentId) ?? new Map<string, { storage: boolean; seq: number }>();
    purges.set(pluginName, { storage, seq: this.bumpSeq(agentId) });
    this.purges.set(agentId, purges);
    this.nudge(agentId);
  }

  public async restartWorker(agentId: string): Promise<void> {
    const state = this.presence.get(agentId)?.state;
    if (state !== 'online' && state !== 'outdated') {
      throw new WorkerRequestError(409, `Worker ${this.nameOf(agentId)} is not online`);
    }
    if (this.updates.active(agentId)) {
      throw new WorkerRequestError(409, `Worker ${this.nameOf(agentId)} is updating, it restarts by itself when the update is done`);
    }
    await this.createWorkerProxy(agentId).restart();
  }

  public async updateWorker(agentId: string, version = ConfigService.RUNNING_VERSION): Promise<void> {
    const worker = this.workers.get(agentId);
    const presence = this.presence.get(agentId);
    if (!worker || (presence?.state !== 'online' && presence?.state !== 'outdated')) {
      throw new WorkerRequestError(409, `Worker ${worker?.name ?? agentId} is not online`);
    }
    if (this.updates.active(agentId) || this.legacyRestarting.has(agentId)) {
      throw new WorkerRequestError(409, `Worker ${worker.name} is already updating`);
    }

    if (!worker.update) {
      throw new WorkerRequestError(409, `Worker ${worker.name} runs ${worker.version ?? 'an older version'} and has to be updated once on its own machine`);
    }
    if (!worker.update.updatable) {
      throw new WorkerRequestError(
        409,
        worker.update.desktop === undefined
          ? `Worker ${worker.name} runs inside the desktop app and updates with it`
          : worker.update.desktop
            ? `There is no update for the desktop app of worker ${worker.name} yet`
            : `Worker ${worker.name} runs without the camera.ui launcher, which installs updates`,
      );
    }
    if (!worker.update.desktop && versionStanding(worker.version, version) === 'ahead') {
      throw new WorkerRequestError(409, `Worker ${worker.name} runs ${worker.version}, which is newer than ${version}`);
    }

    this.logger.log(`Updating worker ${worker.name} (${agentId}) to ${version}`);

    const from = { bootId: presence.bootId, pid: worker.pid, version: worker.version, protocol: worker.protocol, appVersion: worker.appVersion };
    // a restart applies what the earlier attempt staged
    if (this.legacyAttempted.has(agentId) && (await this.restartLegacy(agentId, worker.name))) {
      this.updates.start(agentId, version, from, false);
      this.syncInfo(agentId);
      return;
    }

    const legacy = this.legacyAgents.has(agentId);
    await this.createWorkerProxy(agentId)
      .update(version)
      .catch((error: unknown) => {
        throw legacy ? this.legacyUpdateError(agentId, worker.name, error) : error;
      });
    if (legacy) {
      this.legacyAttempted.add(agentId);
    }

    this.updates.start(agentId, version, from, worker.update.desktop === true, legacy);
    this.syncInfo(agentId);
  }

  public waitWorkerUpdate(agentId: string): Promise<WorkerUpdateResult> {
    return this.updates.wait(agentId);
  }

  public workerUpdatesActive(): boolean {
    // a gone worker's item ends on its own
    return this.updates.activeIds().some((agentId) => this.presence.get(agentId)?.state !== 'offline');
  }

  public async noteWorkerPaired(agentId: string, name: string): Promise<void> {
    await this.workersService.rememberWorker(agentId, name);

    if (!this.presence.has(agentId)) {
      const now = mono();
      this.presence.set(agentId, expectedPresence(now, now + FAILOVER_AFTER_MS));
    }
    this.seedInfo(agentId, name);
    this.syncInfo(agentId);

    await this.listen(agentId);
  }

  public async assignCamera(cameraId: string, agentId: string, workerOnly?: boolean): Promise<'unchanged' | 'moving'> {
    if (!this.camerasService.findById(cameraId)) {
      throw new WorkerRequestError(404, `Camera ${cameraId} not found`);
    }
    this.checkAssignment(WorkerCapability.FrameDecoding, cameraId, agentId);
    this.logger.log(`Assigning camera ${cameraId} to worker ${this.nameOf(agentId)}${describeFallback(workerOnly)}`);
    return this.reassign(WorkerCapability.FrameDecoding, cameraId, agentId, () => this.camerasService.setWorkerAgentId(cameraId, agentId, workerOnly));
  }

  public async unassignCamera(cameraId: string): Promise<'unchanged' | 'moving'> {
    if (!this.camerasService.findById(cameraId)) {
      throw new WorkerRequestError(404, `Camera ${cameraId} not found`);
    }
    this.logger.log(`Unassigning camera ${cameraId}`);
    return this.reassign(WorkerCapability.FrameDecoding, cameraId, undefined, () => this.camerasService.setWorkerAgentId(cameraId, undefined));
  }

  public async assignPlugin(pluginName: string, agentId: string, workerOnly?: boolean): Promise<'unchanged' | 'moving'> {
    const pluginsService = new PluginsService();
    if (!pluginsService.getPluginByName(pluginName)) {
      throw new WorkerRequestError(404, `Plugin ${pluginName} not found`);
    }
    this.checkAssignment(WorkerCapability.PluginHost, pluginName, agentId);
    this.logger.log(`Assigning plugin ${pluginName} to worker ${this.nameOf(agentId)}${describeFallback(workerOnly)}`);
    return this.reassign(WorkerCapability.PluginHost, pluginName, agentId, () => pluginsService.setWorkerAgentId(pluginName, agentId, workerOnly));
  }

  public async unassignPlugin(pluginName: string): Promise<'unchanged' | 'moving'> {
    const pluginsService = new PluginsService();
    if (!pluginsService.getPluginByName(pluginName)) {
      throw new WorkerRequestError(404, `Plugin ${pluginName} not found`);
    }
    this.checkAssignment(WorkerCapability.PluginHost, pluginName, undefined);
    this.logger.log(`Unassigning plugin ${pluginName}`);
    return this.reassign(WorkerCapability.PluginHost, pluginName, undefined, () => pluginsService.setWorkerAgentId(pluginName, undefined));
  }

  public async removeWorker(agentId: string): Promise<void> {
    const name = this.nameOf(agentId);
    this.logger.log(`Removing worker ${name} (${agentId})`);

    const pluginsService = new PluginsService();
    for (const camera of this.camerasService.listByAgentId(agentId)) {
      await this.camerasService.setWorkerAgentId(camera._id, undefined);
    }
    for (const plugin of pluginsService.listByAgentId(agentId)) {
      await pluginsService.setWorkerAgentId(plugin.pluginName, undefined);
    }
    for (const [key, failedOn] of this.failures) {
      if (failedOn === agentId) this.failures.delete(key);
    }
    this.updates.abort(agentId, 'the worker was removed');
    this.purges.delete(agentId);

    // consumers release first, so the release answer carries the final seq
    for (const owner of this.owners.values()) {
      if (owner.host === agentId || owner.waitingFor === agentId) {
        owner.reconsider(`worker ${name} was removed`);
      }
    }
    for (const key of this.holds.get(agentId) ?? []) {
      this.openRelease(key, agentId);
    }

    const presence = this.presence.get(agentId);
    let acked = false;
    if (presence?.state === 'outdated') {
      acked = await this.drainOutdated(agentId);
    } else if (presence && (presence.state === 'online' || presence.state === 'unreachable' || presence.state === 'restarting' || presence.state === 'conflict')) {
      const release: AgentRelease = { reason: 'removed', seq: this.bumpSeq(agentId), acked: false };
      this.agentReleases.set(agentId, release);
      this.step(agentId, { type: 'release', now: mono(), reason: 'removed' });
      this.nudge(agentId);
      await this.until(() => release.acked, RELEASE_ACK_WARN_MS);
      acked = release.acked;
      if (!acked) {
        this.logger.warn(`Worker ${name} did not confirm the stop, its workloads start elsewhere when its lease ended`);
      }
    }

    const latest = this.presence.get(agentId);
    if (latest) {
      this.settleReleasesFrom(agentId, latest, acked);
    }

    await this.stopListening(agentId);
    const hadCredentials = await this.workersService.revokeCredentials(agentId);
    await this.workersService.forgetWorker(agentId);

    this.forget(agentId);

    const socketService = tryInject('socketService');
    socketService?.io.of('/workers').emit('worker-removed', { agentId });
    (socketService?.namespaces.get('/workers') as WorkersNamespace | undefined)?.handleWorkerRemoved(agentId);

    if (hadCredentials) {
      await this.proxyServer.applyLeafNodeAuth();
    }
  }

  public register(owner: PlacementOwner): void {
    this.owners.set(owner.key, owner);
  }

  public unregister(owner: PlacementOwner): void {
    if (this.owners.get(owner.key) === owner) {
      this.owners.delete(owner.key);
    }
  }

  public decide(capability: WorkerCapability, id: string): PlacementDecision {
    const key = workloadKey(capability, id);
    const release = this.releases.get(key);
    if (release) {
      return { host: 'wait-release', agentId: release.from, seq: release.seq };
    }

    const target = this.active ? this.assignmentOf(capability, id) : undefined;
    const refusal = target ? this.refusal(capability, id, target) : undefined;
    const current = this.desired.get(key)?.agentId ?? this.heldBy(key);

    if (current && (!target || refusal || current !== target)) {
      const opened = this.openRelease(key, current);
      if (opened) {
        return { host: 'wait-release', agentId: opened.from, seq: opened.seq };
      }
    }
    if (target && !refusal) {
      return { host: 'worker', agentId: target };
    }
    if (target && refusal?.wait) {
      return { host: 'wait-worker', agentId: target, reason: refusal.reason };
    }
    return { host: 'master', reason: refusal?.reason };
  }

  public desire(capability: WorkerCapability, id: string, agentId: string, fresh: boolean): { gen: string; held?: string } | undefined {
    if (!this.active || this.shutdown) {
      return undefined;
    }
    const built = this.buildWorkload(capability, id);
    if (!built) {
      return undefined;
    }

    const key = workloadKey(capability, id);
    const previous = this.desired.get(key);
    if (previous && previous.agentId !== agentId) {
      this.desired.delete(key);
      this.bumpSeq(previous.agentId);
      this.nudge(previous.agentId);
    }

    const adopt = !fresh && !this.everDesired.has(key);
    this.everDesired.add(key);
    this.holds.get(agentId)?.delete(key);

    const gen = `${this.runId.slice(0, 8)}.${++this.genCounter}`;
    const seq = this.bumpSeq(agentId);
    this.desired.set(key, {
      agentId,
      seq,
      workload: { id, capability, spec: built.spec, live: built.live, revision: ++this.revision, gen, adopt },
    });
    this.nudge(agentId);

    const presence = this.presence.get(agentId);
    return { gen, held: presence && presence.state !== 'online' ? this.waitReason(agentId, presence) : undefined };
  }

  public bind(capability: WorkerCapability, id: string, gen: string, instanceId: string, handshake: 1 | 2): void {
    const desired = this.desired.get(workloadKey(capability, id));
    if (desired?.workload.gen === gen) {
      desired.workload.bound = { instanceId, handshake };
    }
  }

  public release(capability: WorkerCapability, id: string): number | undefined {
    if (this.shutdown) {
      return undefined;
    }
    const key = workloadKey(capability, id);
    const open = this.releases.get(key);
    if (open) {
      return open.seq;
    }
    const from = this.desired.get(key)?.agentId ?? this.heldBy(key);
    return from ? this.openRelease(key, from)?.seq : undefined;
  }

  public refreshLive(capability: WorkerCapability, id: string): void {
    const desired = this.desired.get(workloadKey(capability, id));
    const built = desired ? this.buildWorkload(capability, id) : undefined;
    if (!desired || !built || isEqual(desired.workload.live, built.live)) {
      return;
    }
    desired.workload.live = built.live;
    this.bumpSeq(desired.agentId);
    this.nudge(desired.agentId);
  }

  public noteFailure(capability: WorkerCapability, id: string, agentId: string): void {
    this.failures.set(workloadKey(capability, id), agentId);
  }

  public clearFailure(capability: WorkerCapability, id: string): void {
    this.failures.delete(workloadKey(capability, id));
  }

  private async openTunnel(agentId: string, target: HostPort, token: string): Promise<void> {
    const proxy = this.proxyServer.proxy;
    if (!proxy) {
      throw new Error('no link to workers');
    }

    try {
      const agent = proxy.createProxy<WorkerAgentRPC>(NamespaceManager.workerAgentRpc(agentId), { timeout: TUNNEL_TIMEOUT_MS });
      await agent.openTunnel(target, token);
      this.tunnelWarned.delete(agentId);
    } catch (error) {
      if (!this.tunnelWarned.has(agentId)) {
        this.tunnelWarned.add(agentId);
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          isRPCError(error) && error.code === ERROR_CODES.METHOD_NOT_FOUND
            ? `No stream from plugins on worker ${this.nameOf(agentId)}, it runs an older release. Update the worker.`
            : `No stream from ${hostPort(target)} on worker ${this.nameOf(agentId)}: ${reason}`,
        );
      }
      throw error;
    }
  }

  private async reassign(capability: WorkerCapability, id: string, agentId: string | undefined, write: () => Promise<unknown>): Promise<'unchanged' | 'moving'> {
    const key = workloadKey(capability, id);
    const owner = this.owners.get(key);
    const before = owner?.host;

    // release first, a crash before the new assignment still waits for the old worker
    const current = this.desired.get(key)?.agentId ?? this.heldBy(key);
    if (current && current !== agentId) {
      this.openRelease(key, current);
    }
    await this.releaseWrites;
    await write();
    this.failures.delete(key);

    const expected = this.expectedHost(capability, id);
    const waitingFor = expected === undefined ? this.assignmentOf(capability, id) : undefined;
    if (before === expected && owner?.waitingFor === waitingFor && !this.releases.has(key)) {
      return 'unchanged';
    }
    owner?.reconsider(agentId ? `assigned to worker ${this.nameOf(agentId)}` : 'assigned to this server');
    return 'moving';
  }

  private checkAssignment(capability: WorkerCapability, id: string, agentId: string | undefined): void {
    if (capability === WorkerCapability.PluginHost && !agentId) {
      const plugin = new PluginsService().getPluginByName(id);
      if (plugin && !plugin.info.compatible) {
        const requirement = describePlatformRequirement(plugin.info.os, plugin.info.cpu);
        throw new WorkerRequestError(400, `Plugin ${id} requires ${requirement} and cannot run on this server (${process.platform}/${process.arch})`);
      }
      return;
    }
    if (!agentId) {
      return;
    }

    const worker = this.workers.get(agentId);
    if (!worker) {
      throw new WorkerRequestError(404, `Worker ${agentId} is unknown`);
    }
    if (worker.capabilities.length > 0 && !worker.capabilities.includes(capability)) {
      throw new WorkerRequestError(400, `Worker ${worker.name} does not ${capability === WorkerCapability.FrameDecoding ? 'decode cameras' : 'host plugins'}`);
    }

    if (capability === WorkerCapability.FrameDecoding) {
      if (!this.configService.config.workers?.address) {
        throw new WorkerRequestError(400, 'Set the master address in the worker settings first, workers reach the camera streams through it');
      }
      return;
    }

    const plugin = new PluginsService().getPluginByName(id);
    if (plugin && worker.platform && !isPlatformCompatible(plugin.info.os, plugin.info.cpu, worker.platform.os, worker.platform.arch)) {
      const requirement = describePlatformRequirement(plugin.info.os, plugin.info.cpu);
      throw new WorkerRequestError(400, `Plugin ${id} requires ${requirement}, but worker ${worker.name} is ${worker.platform.os}/${worker.platform.arch}`);
    }
    const level = plugin?.info.protocolLevel;
    const range = this.pluginProtocols.get(agentId);
    if (plugin && typeof level === 'number' && range && (level < range.min || level > range.level)) {
      throw new WorkerRequestError(400, `Plugin ${id} was built for plugin API ${level}, worker ${worker.name} supports ${range.min} to ${range.level}`);
    }
  }

  private targetOf(capability: WorkerCapability, id: string): string | undefined {
    const target = this.active ? this.assignmentOf(capability, id) : undefined;
    return target && !this.refusal(capability, id, target) ? target : undefined;
  }

  private assignmentOf(capability: WorkerCapability, id: string): string | undefined {
    return capability === WorkerCapability.FrameDecoding ? this.getAssignment(id) : this.getPluginAssignment(id);
  }

  private isWorkerOnly(capability: WorkerCapability, id: string): boolean {
    const stored = capability === WorkerCapability.FrameDecoding ? this.camerasService.findById(id) : new PluginsService().getPluginDbByName(id);
    return stored?.workerOnly === true;
  }

  private expectedHost(capability: WorkerCapability, id: string): string | undefined {
    const target = this.active ? this.assignmentOf(capability, id) : undefined;
    if (!target) return 'master';
    const refusal = this.refusal(capability, id, target);
    if (!refusal) return target;
    return refusal.wait ? undefined : 'master';
  }

  private refusal(capability: WorkerCapability, id: string, agentId: string): Refusal | undefined {
    const name = this.nameOf(agentId);
    const presence = this.presence.get(agentId);
    const worker = this.workers.get(agentId);
    const pinned = this.isWorkerOnly(capability, id);
    const wait = pinned || (capability === WorkerCapability.PluginHost && !this.masterCanRun(id));

    if (!presence || !worker) {
      return { reason: `worker ${name} is unknown`, wait: false };
    }
    if (this.failures.get(workloadKey(capability, id)) === agentId) {
      return { reason: `failed on worker ${name}`, wait: pinned };
    }
    if (!isPlaceable(presence.state)) {
      return { reason: `worker ${name} is ${this.describeState(presence.state)}`, wait };
    }
    if (worker.capabilities.length > 0 && !worker.capabilities.includes(capability)) {
      return { reason: `worker ${name} does not offer ${capability}`, wait: pinned };
    }

    if (capability === WorkerCapability.FrameDecoding) {
      if (!this.configService.config.workers?.address) {
        if (!this.addressWarned) {
          this.addressWarned = true;
          this.logger.warn('workers.address is not configured, so workers cannot reach the streams of this server. Cameras run here instead.');
        }
        return { reason: 'workers.address is not configured', wait: pinned };
      }
      return undefined;
    }

    const plugin = new PluginsService().getPluginByName(id);
    if (!plugin) {
      return { reason: `plugin ${id} is not installed`, wait: false };
    }
    if (worker.platform && !isPlatformCompatible(plugin.info.os, plugin.info.cpu, worker.platform.os, worker.platform.arch)) {
      return { reason: `needs ${describePlatformRequirement(plugin.info.os, plugin.info.cpu)}`, wait: pinned };
    }
    const level = plugin.info.protocolLevel;
    const range = this.pluginProtocols.get(agentId);
    if (typeof level === 'number' && range && (level < range.min || level > range.level)) {
      return { reason: `worker ${name} does not support plugin API ${level}`, wait: pinned };
    }
    return undefined;
  }

  private masterCanRun(pluginName: string): boolean {
    const info = new PluginsService().getPluginByName(pluginName)?.info;
    return !!info?.compatible && info.protocolCompat !== 'pluginTooOld' && info.protocolCompat !== 'serverTooOld';
  }

  private buildWorkload(capability: WorkerCapability, id: string): { spec: CapabilitySpec[WorkerCapability]; live: WorkloadLive } | undefined {
    const loggerLevel = this.configService.config.logger.level;

    if (capability === WorkerCapability.FrameDecoding) {
      const camera = this.camerasService.findById(id);
      return camera ? { spec: { cameraId: id }, live: { cameraName: camera.name, loggerLevel } } : undefined;
    }

    const plugin = new PluginsService().getPluginByName(id);
    if (!plugin) {
      return undefined;
    }
    const rtsp = this.configService.go2rtcConfig.rtsp;
    const version = plugin.info.installedVersion ?? 'latest';
    const artifact = plugin.artifact?.version === version ? plugin.artifact : undefined;
    return {
      spec: {
        pluginId: plugin.id,
        pluginName: id,
        version,
        integrity: artifact?.integrity,
        tarball: artifact?.tarball,
        rtspUsername: rtsp.username,
        rtspPassword: rtsp.password,
      },
      live: { displayName: plugin.displayName, loggerLevel },
    };
  }

  private restoreReleases(record: DBWorkerLastShutdown | undefined, clock: HostClock, now: number): void {
    for (const [key, stored] of Object.entries(this.workersService.getReleases())) {
      if (this.presence.has(stored.from)) {
        this.releases.set(key, { from: stored.from, seq: this.bumpSeq(stored.from), at: now });
        continue;
      }
      const rest = graceRest(stored.from, undefined, record, clock);
      if (rest > 0) {
        this.releases.set(key, { from: stored.from, seq: 0, at: now, safeAt: now + rest });
      } else {
        this.persistRelease(key, undefined);
      }
    }
  }

  private buildHolds(): void {
    const disabledPlugins = new Set(this.configService.config.plugins.disabledPlugins);
    const pluginsService = new PluginsService();

    for (const agentId of this.presence.keys()) {
      const keys = new Set<string>();
      for (const camera of this.camerasService.listByAgentId(agentId)) {
        if (!camera.disabled && !camera.detectionSettings?.snooze) {
          keys.add(workloadKey(WorkerCapability.FrameDecoding, camera._id));
        }
      }
      for (const plugin of pluginsService.listByAgentId(agentId)) {
        if (!disabledPlugins.has(plugin.pluginName)) {
          keys.add(workloadKey(WorkerCapability.PluginHost, plugin.pluginName));
        }
      }
      for (const key of keys) {
        if (this.releases.has(key)) keys.delete(key);
      }
      if (keys.size > 0) {
        this.holds.set(agentId, keys);
      }
    }
  }

  private heldBy(key: string): string | undefined {
    for (const [agentId, keys] of this.holds) {
      if (keys.has(key)) return agentId;
    }
    return undefined;
  }

  private assignedKeys(agentId: string): string[] {
    const keys = this.camerasService.listByAgentId(agentId).map((camera) => workloadKey(WorkerCapability.FrameDecoding, camera._id));
    for (const plugin of new PluginsService().listByAgentId(agentId)) {
      keys.push(workloadKey(WorkerCapability.PluginHost, plugin.pluginName));
    }
    return keys;
  }

  private workloadCount(agentId: string): number {
    let count = this.holds.get(agentId)?.size ?? 0;
    for (const desired of this.desired.values()) {
      if (desired.agentId === agentId) count++;
    }
    return count;
  }

  private bumpSeq(agentId: string): number {
    const seq = (this.seqs.get(agentId) ?? 0) + 1;
    this.seqs.set(agentId, seq);
    return seq;
  }

  private openRelease(key: string, from: string): Release | undefined {
    if (this.desired.get(key)?.agentId === from) {
      this.desired.delete(key);
    }
    this.holds.get(from)?.delete(key);

    const open = this.releases.get(key);
    if (open?.from === from) {
      return open;
    }

    const presence = this.presence.get(from);
    if (!presence || presence.state === 'offline') {
      this.bumpSeq(from);
      return undefined;
    }

    const now = mono();
    const release: Release = { from, seq: this.bumpSeq(from), at: now };
    if (presence.state === 'outdated') {
      release.probe = true;
    } else if (presence.state === 'conflict' || presence.state === 'released' || presence.state === 'releasing') {
      release.safeAt = this.safeAfter(presence, now);
    }
    this.releases.set(key, release);
    this.persistRelease(key, release);
    this.nudge(from);
    return release;
  }

  private completeRelease(key: string): void {
    if (!this.releases.delete(key)) {
      return;
    }
    this.persistRelease(key, undefined);
    this.owners.get(key)?.handle({ type: 'released', now: mono() });
  }

  private completeReleasesFrom(agentId: string, probes = false): void {
    for (const [key, release] of this.releases) {
      if (release.from === agentId && (probes || !release.probe)) {
        this.completeRelease(key);
      }
    }
  }

  private settleReleasesFrom(agentId: string, presence: Presence, acked: boolean): void {
    if (acked || presence.state === 'offline') {
      this.completeReleasesFrom(agentId, true);
      return;
    }
    const safeAt = this.safeAfter(presence, mono());
    for (const release of this.releases.values()) {
      if (release.from === agentId && !release.probe) {
        release.safeAt = Math.max(release.safeAt ?? 0, safeAt);
      }
    }
  }

  private safeAfter(presence: Presence, now: number): number {
    switch (presence.state) {
      case 'offline':
        return now;
      case 'expected':
        return presence.graceUntil ?? now;
      default:
        return Math.max((presence.lastReceive ?? presence.since) + FAILOVER_AFTER_MS, presence.successorUntil ?? 0, presence.holdUntil ?? 0);
    }
  }

  private persistRelease(key: string, release: Release | undefined): void {
    const stored = release ? { from: release.from, at: Date.now(), runId: this.runId } : undefined;
    this.releaseWrites = this.releaseWrites
      .then(() => this.workersService.saveRelease(key, stored))
      .catch((error) => this.logger.error(`Failed to store the release of ${key}:`, error));
  }

  private desiredFor(agentId: string): WorkloadSpec[] {
    const workloads: WorkloadSpec[] = [];
    for (const desired of this.desired.values()) {
      if (desired.agentId === agentId) {
        workloads.push(desired.workload);
      }
    }
    return workloads;
  }

  private heldKeys(agentId: string, withDesired: boolean): string[] {
    const keys = Array.from(this.holds.get(agentId) ?? []);
    if (withDesired) {
      for (const [key, desired] of this.desired) {
        if (desired.agentId === agentId) keys.push(key);
      }
    }
    return keys;
  }

  private handleHeartbeat(agentId: string, heartbeat: WorkerHeartbeat): WorkerSyncResponse {
    if (heartbeat?.agentId !== agentId) {
      this.logger.warn(`Rejected a heartbeat for ${heartbeat?.agentId} from worker ${agentId}`);
      throw new Error(`Worker ${agentId} cannot send a heartbeat for ${heartbeat?.agentId}`);
    }
    // no answer, no lease: only workers told about the shutdown keep their work
    if (this.shutdown && !this.shutdown.notified.has(agentId)) {
      throw new Error('The master is shutting down');
    }

    const now = mono();
    if (!this.presence.has(agentId)) {
      this.presence.set(agentId, expectedPresence(now, now));
    }
    this.legacyAgents.delete(agentId);
    this.legacyAttempted.delete(agentId);
    this.updates.report(agentId, heartbeat);
    this.noteHeartbeat(agentId, heartbeat);
    this.workersService.rememberWorker(agentId, heartbeat.name, { version: heartbeat.version, protocol: heartbeat.protocol }).catch(() => {});

    if ((heartbeat.protocol ?? 0) < MIN_WORKER_PROTOCOL) {
      this.markOutdated(agentId, `${heartbeat.version || 'unknown'}, protocol ${heartbeat.protocol ?? 'none'}`);
      return { workloads: [], updateChannel: this.updateChannel(), master: { ...this.masterInfo(agentId), release: { reason: 'incompatible' } } };
    }

    this.step(agentId, { type: 'heartbeat', now, bootId: heartbeat.bootId, prevBootIds: heartbeat.prevBootIds, lease: heartbeat.lease?.state });
    const presence = this.presence.get(agentId)!;
    const kind = answerKind(presence, heartbeat.bootId);
    const reports = heartbeat.bootId === undefined || heartbeat.bootId === presence.bootId ? this.acceptReports(agentId, heartbeat) : undefined;

    if (reports && (kind === 'normal' || kind === 'release')) {
      this.ackReleases(agentId, reports);
      this.ackPurges(agentId, reports);
    }
    if (reports && kind === 'normal' && (presence.state === 'online' || presence.state === 'unreachable')) {
      this.dispatchReports(agentId, reports, now);
    }

    const purge = Array.from(this.purges.get(agentId) ?? [], ([pluginName, { storage }]) => ({ pluginName, storage }));
    const answer = {
      ...this.answer(agentId, this.presence.get(agentId)!, heartbeat.bootId, now),
      updateTarget: this.updateTarget(),
      purge: purge.length > 0 ? purge : undefined,
    };
    this.answered.add(agentId);
    if (answer.master?.stopping || this.shutdown?.removeAll) {
      this.shutdown?.answered.add(agentId);
    }
    return answer;
  }

  private answer(agentId: string, presence: Presence, bootId: string | undefined, now: number): WorkerSyncResponse {
    const updateChannel = this.updateChannel();
    const master = this.masterInfo(agentId);
    if (this.shutdown?.removeAll) {
      return { workloads: [], updateChannel, master: { ...master, release: { reason: 'removed' } } };
    }

    switch (answerKind(presence, bootId)) {
      case 'conflict':
        return { workloads: [], updateChannel, master: { ...master, release: { reason: 'conflict' } } };
      case 'release':
        return { workloads: [], updateChannel, master: { ...master, release: { reason: presence.release ?? 'disabled' } } };
      case 'buried':
        return { workloads: [], updateChannel, master };
      case 'holds-only':
        return { workloads: [], updateChannel, master: { ...master, holds: this.heldKeys(agentId, true) } };
      case 'normal': {
        const until = this.shutdown?.until.get(agentId);
        return {
          workloads: this.desiredFor(agentId),
          updateChannel,
          master: {
            ...master,
            holds: this.heldKeys(agentId, false),
            stopping: until !== undefined ? { untilMs: Math.max(LEASE_MS, Math.round(until - now)) } : undefined,
          },
        };
      }
    }
  }

  private masterInfo(agentId: string): MasterSyncInfo {
    return { runId: this.runId, level: WORKER_PROTOCOL, seq: this.seqs.get(agentId) ?? 0, leaseMs: LEASE_MS };
  }

  private updateChannel(): 'latest' | 'beta' {
    return this.configService.config.betaUpdates ? 'beta' : 'latest';
  }

  private acceptReports(agentId: string, heartbeat: WorkerHeartbeat): Reports | undefined {
    const previous = this.reports.get(agentId);
    if (previous && previous.bootId === heartbeat.bootId && heartbeat.reportSeq !== undefined && heartbeat.reportSeq <= previous.reportSeq) {
      return undefined;
    }

    const reports: Reports = {
      bootId: heartbeat.bootId,
      reportSeq: heartbeat.reportSeq ?? 0,
      runId: heartbeat.runId,
      appliedSeq: heartbeat.appliedSeq,
      workloads: new Map((heartbeat.workloads ?? []).map((report) => [report.key, report])),
    };
    this.reports.set(agentId, reports);
    return reports;
  }

  private ackReleases(agentId: string, reports: Reports): void {
    if (reports.runId !== this.runId || reports.appliedSeq === undefined) {
      return;
    }
    const applied = reports.appliedSeq;

    for (const [key, release] of this.releases) {
      if (release.from !== agentId || release.probe || applied < release.seq) continue;
      const report = reports.workloads.get(key);
      if (!report || !isLive(report)) {
        this.completeRelease(key);
      }
    }

    const agentRelease = this.agentReleases.get(agentId);
    if (agentRelease && !agentRelease.acked && applied >= agentRelease.seq && !Array.from(reports.workloads.values()).some(isLive)) {
      agentRelease.acked = true;
      this.completeReleasesFrom(agentId, true);
    }
  }

  private ackPurges(agentId: string, reports: Reports): void {
    const purges = this.purges.get(agentId);
    if (!purges || reports.runId !== this.runId || reports.appliedSeq === undefined) {
      return;
    }
    for (const [pluginName, purge] of purges) {
      if (reports.appliedSeq >= purge.seq) purges.delete(pluginName);
    }
    if (purges.size === 0) {
      this.purges.delete(agentId);
    }
  }

  private dispatchReports(agentId: string, reports: Reports, now: number): void {
    const applied = reports.runId === this.runId ? (reports.appliedSeq ?? -1) : -1;
    for (const [key, desired] of this.desired) {
      if (desired.agentId !== agentId) continue;
      const owner = this.owners.get(key);
      const report = reports.workloads.get(key);
      if (!owner || (!report && applied < desired.seq)) continue;
      owner.handle({ type: 'report', now, report });
    }
  }

  private handleDisconnect(agentId: string, data: WorkerDisconnect | undefined): void {
    if (data?.agentId !== agentId) {
      this.logger.warn(`Ignored a disconnect for ${data?.agentId} from worker ${agentId}`);
      return;
    }

    const presence = this.presence.get(agentId);
    if (!presence) {
      return;
    }
    const now = mono();

    // a worker that stops while it releases has confirmed it
    if (presence.release && data.phase === 'stopped' && (!data.bootId || data.bootId === presence.bootId)) {
      const release = this.agentReleases.get(agentId);
      if (release) release.acked = true;
      this.completeReleasesFrom(agentId, true);
      return;
    }

    if (data.reason === 'update' && (!data.bootId || data.bootId === presence.bootId)) {
      this.updates.restarting(agentId);
    }
    this.step(agentId, { type: 'disconnect', now, bootId: data.bootId, reason: data.reason, phase: data.phase, expectBackMs: data.expectBackMs });
  }

  private step(agentId: string, event: PresenceEvent): void {
    const before = this.presence.get(agentId);
    if (!before) {
      return;
    }
    const { state, effects } = reducePresence(before, event);
    if (state === before && effects.length === 0) {
      return;
    }

    this.presence.set(agentId, state);
    if (state.state !== before.state) {
      this.noteRehome(agentId, state.state, event.now);
    }
    if (state.successorUntil !== undefined && before.successorUntil === undefined && before.bootId) {
      this.logger.warn(
        // prettier-ignore
        `Worker ${this.nameOf(agentId)} started as boot ${shortId(state.bootId)}, but boot ${shortId(before.bootId)} may still run, ` +
        `holding its workloads until ${this.wallOf(state.successorUntil)}`,
      );
    }

    for (const effect of effects) {
      this.applyEffect(agentId, effect, before, event.now);
    }
    this.syncInfo(agentId);
  }

  private applyEffect(agentId: string, effect: PresenceEffect, before: Presence, now: number): void {
    const name = this.nameOf(agentId);
    const presence = this.presence.get(agentId)!;

    switch (effect.type) {
      case 'online': {
        // an outdated worker back on this protocol was updated, its old process is gone
        if (effect.previous === 'outdated') {
          this.completeReleasesFrom(agentId, true);
        }
        if (effect.previous !== 'restarting') {
          const info = this.workers.get(agentId);
          this.logger.log(
            // prettier-ignore
            `Worker ${name} online: boot ${shortId(presence.bootId)}, protocol ${info?.protocol ?? '?'}, ` +
            `version ${info?.version ?? 'unknown'}, ${this.workloadCount(agentId)} workloads`,
          );
        }
        this.forOwnersOn(agentId, { type: 'resumed', now });
        this.notices.online(agentId, name);
        for (const owner of this.owners.values()) {
          if (owner.waitingFor === agentId) {
            owner.reconsider(`worker ${name} is online`);
          }
        }
        break;
      }
      case 'instances-gone': {
        this.completeReleasesFrom(agentId);
        const restarted = effect.bootId !== presence.bootId;
        this.forOwnersOn(agentId, { type: 'instances-gone', now, reason: restarted ? 'the worker restarted' : 'the worker stopped its workloads' });
        if (restarted && effect.bootId && presence.bootId) {
          this.logger.log(
            // prettier-ignore
            `Worker ${name} came back after a restart (boot ${shortId(presence.bootId)}, was ${shortId(effect.bootId)}), ` +
            `starting ${this.workloadCount(agentId)} workloads`,
          );
        }
        break;
      }
      case 'held': {
        const count = this.forOwnersOn(agentId, { type: 'held', now, reason: effect.reason });
        if (presence.state === 'restarting') {
          this.logger.log(`Worker ${name} ${effect.reason}, holding its workloads until ${this.wallOf(presence.holdUntil ?? now)}`);
        } else if (effect.reason === 'not answering') {
          const silence = Math.round((now - (presence.lastReceive ?? before.since)) / 1000);
          this.logger.warn(`Worker ${name} not answering for ${silence} s, keeping its ${count} workloads there until ${this.wallOf(this.safeAfter(presence, now))}`);
        } else {
          this.logger.warn(`Worker ${name} does not receive answers, keeping its ${count} workloads there until ${this.wallOf(this.safeAfter(presence, now))}`);
        }
        break;
      }
      case 'resumed':
        this.forOwnersOn(agentId, { type: 'resumed', now });
        this.logger.log(`Worker ${name} answers again after ${Math.round((now - before.since) / 1000)} s`);
        break;
      case 'fenced':
        this.completeReleasesFrom(agentId);
        this.forOwnersOn(agentId, { type: 'instances-gone', now, reason: 'stopped by the lease' });
        this.logger.warn(`Worker ${name} stopped its workloads because the answers of this server do not arrive (lease fenced)`);
        break;
      case 'failover':
        this.failover(agentId, effect.reason, before, now);
        break;
      case 'conflict':
        this.conflict(agentId, effect.boots);
        break;
    }
  }

  private failover(agentId: string, reason: string, before: Presence, now: number): void {
    let dropped = false;
    for (const [key, desired] of this.desired) {
      if (desired.agentId === agentId) {
        this.desired.delete(key);
        dropped = true;
      }
    }
    if (dropped) {
      this.bumpSeq(agentId);
    }
    this.holds.delete(agentId);
    this.completeReleasesFrom(agentId);

    const moved: string[] = [];
    const waiting: string[] = [];
    for (const owner of this.owners.values()) {
      if (owner.host !== agentId) continue;
      owner.handle({ type: 'failover', now, reason });
      if (owner.waitingFor) waiting.push(owner.label);
      else moved.push(owner.host === 'master' ? `${owner.label} to the master` : owner.label);
    }

    const name = this.nameOf(agentId);
    const moving =
      (moved.length > 0 ? `, moving ${moved.join(', ')}` : '') +
      (waiting.length > 0 ? `, ${waiting.join(', ')} ${waiting.length > 1 ? 'wait' : 'waits'} for the worker` : '');
    switch (reason) {
      case 'no heartbeat':
        this.logger.warn(`Worker ${name} lost: no heartbeat for ${Math.round((now - (before.lastReceive ?? before.since)) / 1000)} s${moving}`);
        break;
      case 'did not connect':
        if (moving) {
          this.logger.warn(`Worker ${name} did not connect after this server started${moving}`);
        } else {
          this.logger.log(`Worker ${name} did not connect after this server started`);
        }
        break;
      case 'lease fenced':
        this.logger.warn(`Worker ${name} does not receive answers (lease fenced)${moving}`);
        break;
      case 'stopped':
      case 'went to sleep':
        this.logger.log(`Worker ${name} ${reason}${moving}`);
        return;
      default:
        this.logger.warn(`Worker ${name} ${reason}${moving}`);
    }
    this.notices.lost(agentId, name, reason, { moved: moved.length, waiting: waiting.length });
  }

  private conflict(agentId: string, boots: [string, string]): void {
    this.logger.error(`Two machines use the identity of worker ${this.nameOf(agentId)} (boots ${shortId(boots[0])} and ${shortId(boots[1])}), both stopped`);
    this.moveWorkFrom(agentId, 'two machines use the identity of the worker');
  }

  private markOutdated(agentId: string, reason: string): void {
    const before = this.presence.get(agentId);
    if (!before) {
      return;
    }
    this.step(agentId, { type: 'outdated', now: mono(), reason });
    if (before.state === 'outdated') {
      return;
    }

    this.logger.warn(`Worker ${this.nameOf(agentId)} is outdated (${reason}), update it on the Updates page`);
    this.moveWorkFrom(agentId, 'the worker is outdated');
  }

  private moveWorkFrom(agentId: string, reason: string): void {
    for (const key of this.heldKeys(agentId, true)) {
      this.openRelease(key, agentId);
    }
    for (const owner of this.owners.values()) {
      if (owner.host === agentId) {
        owner.reconsider(reason);
      }
    }
  }

  private forOwnersOn(agentId: string, event: PlacementEvent): number {
    let count = 0;
    for (const owner of this.owners.values()) {
      if (owner.host === agentId) {
        owner.handle(event);
        count++;
      }
    }
    return Math.max(count, this.workloadCount(agentId));
  }

  private noteRehome(agentId: string, state: WorkerState, now: number): void {
    const rehome = this.rehome.get(agentId) ?? { offlines: [] };
    if (state === 'online') {
      rehome.onlineSince ??= now;
    } else {
      rehome.onlineSince = undefined;
      if (state === 'offline') {
        rehome.offlines.push(now);
      }
    }
    this.rehome.set(agentId, rehome);
  }

  private rehomeTick(now: number): void {
    for (const [agentId, rehome] of this.rehome) {
      if (rehome.onlineSince === undefined || !this.active) continue;
      rehome.offlines = rehome.offlines.filter((at) => now - at < REHOME_FLAP_WINDOW_MS);
      const stable = Math.min(REHOME_STABLE_MS * 2 ** Math.max(0, rehome.offlines.length - 2), REHOME_STABLE_MAX_MS);
      if (now - rehome.onlineSince < stable) continue;

      for (const [key, owner] of this.owners) {
        const parsed = parseWorkloadKey(key);
        if (owner.host === 'master' && parsed && this.targetOf(parsed.capability, parsed.id) === agentId) {
          owner.reconsider(`worker ${this.nameOf(agentId)} is back`);
          break;
        }
      }
    }
  }

  private tick(): void {
    const now = mono();
    const stalled = now - (this.lastTickAt ?? now) - PRESENCE_TICK_MS;
    this.lastTickAt = now;
    if (stalled >= SELF_STALL_MS) {
      this.logger.warn(`This server was stalled for ${Math.round(stalled / 1000)} s, that time does not count against the workers`);
    }

    for (const agentId of Array.from(this.presence.keys())) {
      if (stalled >= SELF_STALL_MS) {
        this.step(agentId, { type: 'paused', now, ms: stalled });
      }
      this.step(agentId, { type: 'tick', now });
    }
    this.updates.tick();

    for (const [key, release] of this.releases) {
      if (release.safeAt !== undefined && now >= release.safeAt) {
        this.completeRelease(key);
      }
    }
    this.checkProbeReleases(now);

    if (this.readyAt !== undefined && !this.holdsExpired && now >= this.readyAt + HOLD_MAX_MS) {
      this.holdsExpired = true;
      for (const [agentId, keys] of this.holds) {
        for (const key of Array.from(keys)) {
          this.logger.log(`Worker ${this.nameOf(agentId)} kept ${this.describeKey(key)} running, but nothing here asked for it, stopping it there`);
          this.openRelease(key, agentId);
        }
      }
    }

    this.rehomeTick(now);

    for (const owner of Array.from(this.owners.values())) {
      owner.handle({ type: 'tick', now });
    }
  }

  private checkProbeReleases(now: number): void {
    const agents = new Set<string>();
    for (const release of this.releases.values()) {
      if (release.probe) agents.add(release.from);
    }

    for (const agentId of agents) {
      const opened = Math.min(...Array.from(this.releases.values(), (release) => (release.from === agentId && release.probe ? release.at : Infinity)));
      // no ping answer for this long: the machine and its work are gone
      if (now - Math.max(opened, this.probeOkAt.get(agentId) ?? 0) >= FAILOVER_AFTER_MS) {
        this.completeReleasesFrom(agentId, true);
        continue;
      }
      if (now - (this.probeAt.get(agentId) ?? 0) >= PROBE_RELEASE_MS) {
        this.probe(agentId);
      }
    }
  }

  private probeOutdatedWorkers(): void {
    for (const agentId of this.listeners.keys()) {
      const state = this.presence.get(agentId)?.state;
      if (state === 'online' || state === 'releasing' || state === 'released') continue;
      this.probe(agentId);
    }
  }

  private probe(agentId: string): void {
    if (this.probing.has(agentId)) {
      return;
    }
    this.probing.add(agentId);
    this.probeAt.set(agentId, mono());

    this.createWorkerProxy(agentId)
      .ping()
      .then((health) => this.onProbe(agentId, health))
      .catch(() => {})
      .finally(() => this.probing.delete(agentId));
  }

  private onProbe(agentId: string, health: WorkerHealthInfo | undefined): void {
    if (!health || !this.presence.has(agentId)) {
      return;
    }
    this.probeOkAt.set(agentId, mono());
    if (health.version && (health.protocol ?? 0) >= MIN_WORKER_PROTOCOL) {
      return;
    }

    const worker = this.workers.get(agentId);
    if (worker) {
      worker.version = health.version;
      worker.protocol = health.protocol;
      worker.cameras = health.cameras ?? [];
      worker.versionMismatch = true;
    }
    // agents up to 2.3.0 lose their heartbeat at the leaf, ping, restart and (since 2.1.0) update still work
    if (!health.version && !this.legacyAgents.has(agentId)) {
      this.legacyAgents.add(agentId);
      this.updates.assume(agentId, { updatable: true, updating: false });
    }
    const wasOutdated = this.presence.get(agentId)?.state === 'outdated';
    this.markOutdated(agentId, health.version ? `${health.version}, no protocol level` : 'no version');

    if (!health.cameras?.length) {
      this.completeReleasesFrom(agentId, true);
      return;
    }
    if (!wasOutdated) {
      this.logger.warn(`Restarting worker ${this.nameOf(agentId)}, it still runs ${health.cameras.length} workloads without a master`);
      this.createWorkerProxy(agentId)
        .restart()
        .catch(() => {});
    }
  }

  private async drainOutdated(agentId: string): Promise<boolean> {
    const health = await this.createWorkerProxy(agentId)
      .ping()
      .catch(() => undefined);
    if (!health?.cameras?.length) {
      return true;
    }

    this.logger.log(`Restarting worker ${this.nameOf(agentId)} so it stops its workloads before it is removed`);
    await this.createWorkerProxy(agentId)
      .restart()
      .catch(() => {});
    const drained = await this.until(() => !this.releasesFrom(agentId), REMOVE_DRAIN_MS);
    return drained;
  }

  private async restartLegacy(agentId: string, name: string): Promise<boolean> {
    this.legacyRestarting.add(agentId);
    try {
      const proxy = this.createWorkerProxy(agentId);
      const requestedAt = Date.now();
      this.logger.log(`Restarting worker ${name} before it installs the update again`);
      await proxy.restart().catch((error: unknown) => {
        throw this.legacyUpdateError(agentId, name, error);
      });
      this.legacyAttempted.delete(agentId);

      const deadline = mono() + LEGACY_RESTART_MS;
      while (mono() < deadline) {
        await sleep(LEGACY_RESTART_POLL_MS);
        const health = await proxy.ping().catch(() => undefined);
        // uptime shorter than the wait means a new process
        if (health && health.uptime < Date.now() - requestedAt) {
          return health.version !== undefined;
        }
      }
    } finally {
      this.legacyRestarting.delete(agentId);
    }
    throw new WorkerRequestError(409, `Worker ${name} did not come back within ${Math.round(LEGACY_RESTART_MS / 60_000)} min after its restart`);
  }

  private legacyUpdateError(agentId: string, name: string, error: unknown): WorkerRequestError {
    if (isNoRespondersError(error) || (isRPCError(error) && (error.code === ERROR_CODES.NOT_FOUND || error.code === ERROR_CODES.METHOD_NOT_FOUND))) {
      this.updates.assume(agentId, undefined);
      this.syncInfo(agentId);
      return new WorkerRequestError(409, `Worker ${name} runs an older version and has to be updated once on its own machine`);
    }
    return new WorkerRequestError(409, `Worker ${name} did not start the update: ${error instanceof Error ? error.message : String(error)}`);
  }

  private releasesFrom(agentId: string): boolean {
    for (const release of this.releases.values()) {
      if (release.from === agentId) return true;
    }
    return false;
  }

  private forget(agentId: string): void {
    this.presence.delete(agentId);
    this.workers.delete(agentId);
    this.reports.delete(agentId);
    this.pluginProtocols.delete(agentId);
    this.seqs.delete(agentId);
    this.holds.delete(agentId);
    this.agentReleases.delete(agentId);
    this.rehome.delete(agentId);
    this.answered.delete(agentId);
    this.probeOkAt.delete(agentId);
    this.probeAt.delete(agentId);
    this.legacyAgents.delete(agentId);
    this.legacyAttempted.delete(agentId);
    clearTimeout(this.updateTimers.get(agentId));
    this.updateTimers.delete(agentId);
    this.lastUpdateAt.delete(agentId);
    this.notices.forget(agentId);
  }

  private waitReason(agentId: string, presence: Presence): string {
    const name = this.nameOf(agentId);
    switch (presence.state) {
      case 'expected':
        return `waiting for worker ${name} until ${this.wallOf(presence.graceUntil ?? mono())}`;
      case 'restarting':
        return `worker ${name} is restarting`;
      default:
        return `waiting for worker ${name} since ${this.wallOf(presence.since)}`;
    }
  }

  private describeState(state: WorkerState): string {
    switch (state) {
      case 'outdated':
        return 'outdated';
      case 'conflict':
        return 'used by two machines';
      case 'releasing':
      case 'released':
        return 'disabled';
      default:
        return state;
    }
  }

  private describeKey(key: string): string {
    const parsed = parseWorkloadKey(key);
    if (!parsed) {
      return key;
    }
    return parsed.capability === WorkerCapability.FrameDecoding ? `camera ${this.camerasService.findById(parsed.id)?.name ?? parsed.id}` : `plugin ${parsed.id}`;
  }

  private wallOf(at: number): string {
    return clockTime(Date.now() + (at - mono()));
  }

  private until(check: () => boolean, timeoutMs: number): Promise<boolean> {
    if (check()) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const started = mono();
      const timer = setInterval(() => {
        if (check()) {
          clearInterval(timer);
          resolve(true);
        } else if (mono() - started >= timeoutMs) {
          clearInterval(timer);
          resolve(false);
        }
      }, WAIT_POLL_MS);
    });
  }

  private createWorkerProxy(agentId: string): Promisify<WorkerAgentRPC> {
    const proxy = this.proxyServer.proxy;
    if (!proxy) {
      throw new Error('Proxy is not initialized');
    }
    return proxy.createProxy<WorkerAgentRPC>(NamespaceManager.workerAgentRpc(agentId));
  }

  private async listen(agentId: string): Promise<void> {
    const proxy = this.proxyServer.proxy;
    if (!this.active || !proxy || this.listeners.has(agentId)) {
      return;
    }

    if (!SUBJECT_TOKEN.test(agentId)) {
      this.logger.warn(`Worker ${agentId} has an invalid id, remove it and pair it again`);
      return;
    }

    const listening = (async () => {
      const closeHeartbeat = await proxy.registerHandler(
        NamespaceManager.workerManagerRpc(agentId),
        { heartbeat: (heartbeat: WorkerHeartbeat) => this.handleHeartbeat(agentId, heartbeat) },
        { withoutDecorators: true },
      );
      const unsubscribeDisconnect = await proxy.subscribe(NamespaceManager.workerDisconnect(agentId), (data: WorkerDisconnect) => {
        this.handleDisconnect(agentId, data);
      });
      const unsubscribeLogs = await proxy.subscribe(NamespaceManager.workerLogs(agentId), (entry: LogEntry) => {
        this.handleForwardedLog(agentId, entry);
      });

      return async () => {
        unsubscribeDisconnect();
        unsubscribeLogs();
        await closeHeartbeat();
      };
    })();

    this.listeners.set(agentId, listening);

    try {
      await listening;
    } catch (error) {
      this.listeners.delete(agentId);
      throw error;
    }
  }

  private async stopListening(agentId: string): Promise<void> {
    const listening = this.listeners.get(agentId);
    this.listeners.delete(agentId);

    const close = await listening?.catch(() => undefined);
    await close?.();
  }

  private nudge(agentId: string, extra: Pick<WorkerNudge, 'notice'> = {}): void {
    try {
      const nudge: WorkerNudge = { runId: this.runId, seq: this.seqs.get(agentId) ?? 0, ...extra };
      this.proxyServer.proxy?.publish(NamespaceManager.workerSync(agentId), nudge);
    } catch {
      // the agent converges on its next heartbeat anyway
    }
  }

  private seedInfo(agentId: string, name: string, known?: KnownWorker): void {
    if (this.workers.has(agentId)) {
      return;
    }
    this.workers.set(agentId, {
      agentId,
      name: this.workersService.getWorkerDisplayName(agentId) ?? name,
      serverAddresses: known?.serverAddresses ?? this.workersService.getWorkerServerAddresses(agentId),
      online: false,
      lastHeartbeat: known?.lastSeen ?? Date.now(),
      cameras: [],
      capabilities: [],
      version: known?.version,
      protocol: known?.protocol,
    });
  }

  private noteHeartbeat(agentId: string, heartbeat: WorkerHeartbeat): void {
    const existing = this.workers.get(agentId);
    const versionMismatch = heartbeat.version !== ConfigService.RUNNING_VERSION;
    if (versionMismatch && !existing?.versionMismatch && !this.updates.active(agentId)) {
      this.logger.warn(
        `Worker ${heartbeat.name} runs version ${heartbeat.version || 'unknown'}, this server runs ${ConfigService.RUNNING_VERSION}. Update it on the Updates page.`,
      );
    }

    this.workers.set(agentId, {
      ...existing,
      agentId,
      name: this.workersService.getWorkerDisplayName(agentId) ?? heartbeat.name,
      online: existing?.online ?? false,
      lastHeartbeat: Date.now(),
      cameras: heartbeat.cameras,
      capabilities: heartbeat.capabilities ?? [],
      version: heartbeat.version,
      versionMismatch,
      platform: heartbeat.platform,
      addresses: heartbeat.addresses,
      serverAddresses: this.workersService.getWorkerServerAddresses(agentId),
      system: heartbeat.system,
      pid: heartbeat.pid,
      cpuLoad: heartbeat.cpuLoad,
      memLoad: heartbeat.memLoad,
      plugins: heartbeat.plugins,
      processes: heartbeat.processes,
      update: this.updates.state(agentId),
      appVersion: heartbeat.appVersion,
      protocol: heartbeat.protocol,
      workloads: heartbeat.workloads,
      lease: heartbeat.lease,
    });
    if (heartbeat.pluginProtocol) {
      this.pluginProtocols.set(agentId, heartbeat.pluginProtocol);
    }
    this.syncInfo(agentId);
  }

  private syncInfo(agentId: string): void {
    const worker = this.workers.get(agentId);
    const presence = this.presence.get(agentId);
    if (!worker) {
      return;
    }
    if (presence) {
      worker.state = presence.state;
      worker.online = presence.state === 'online';
      worker.stateSince = Math.round(Date.now() - (mono() - presence.since));
      const until = presenceDeadline(presence);
      worker.stateUntil = until === undefined ? undefined : Math.round(Date.now() + (until - mono()));
      worker.stateReason = presence.reason;
      worker.bootId = presence.bootId;
    }
    worker.update = this.updates.state(agentId);
    this.emitWorkerUpdate(worker);
  }

  private handleForwardedLog(agentId: string, entry: LogEntry): void {
    const scoped = this.scopeForwardedLog(agentId, entry);
    tryInject('logManager')?.handleChildLog(scoped);

    const pluginId = scoped.targetType === 'plugin' ? scoped.targetId : scoped.pluginId;
    if (pluginId) this.proxyServer.notificationManager.notePluginLog(pluginId, scoped);
  }

  private scopeForwardedLog(agentId: string, entry: LogEntry): LogEntry {
    const pluginsService = new PluginsService();
    const runsPlugin = (pluginId?: string): boolean => !!pluginId && pluginsService.getPluginDbById(pluginId)?.workerAgentId === agentId;
    const pluginId = runsPlugin(entry.pluginId) ? entry.pluginId : undefined;

    if (entry.targetType === 'plugin' && runsPlugin(entry.targetId)) {
      return { ...entry, pluginId };
    }

    const camera = entry.targetType === 'camera' && entry.targetId ? this.camerasService.findById(entry.targetId) : undefined;
    const servedPlugin = pluginId !== undefined && (camera?.pluginInfo?.id === pluginId || camera?.plugins.some(({ id }) => id === pluginId));
    if (camera && (camera.workerAgentId === agentId || servedPlugin)) {
      return { ...entry, pluginId };
    }

    return { ...entry, pluginId, targetId: undefined, targetType: 'system', suffix: this.nameOf(agentId) };
  }

  private onUpdateResult(result: WorkerUpdateResult): void {
    this.syncInfo(result.agentId);
    updatesService().noteWorkerUpdateResult(result, this.nameOf(result.agentId));
  }

  private updateTarget(): string {
    const serverNsp = tryInject('socketService')?.namespaces.get('/server') as ServerNamespace | undefined;
    return serverNsp?.targetServerVersion() ?? ConfigService.RUNNING_VERSION;
  }

  private withStanding(worker: WorkerInfo, target: string): WorkerInfo {
    worker.versionStanding = versionStanding(worker.version, target);
    return worker;
  }

  private emitWorkerUpdate(worker: WorkerInfo): void {
    const { agentId } = worker;
    if (this.updateTimers.has(agentId)) {
      return;
    }

    const wait = (this.lastUpdateAt.get(agentId) ?? 0) + WORKER_UPDATE_INTERVAL_MS - Date.now();
    if (wait <= 0) {
      this.publishWorkerUpdate(worker);
      return;
    }

    const timer = setTimeout(() => {
      this.updateTimers.delete(agentId);
      const latest = this.workers.get(agentId);
      if (latest) {
        this.publishWorkerUpdate(latest);
      }
    }, wait);
    timer.unref();
    this.updateTimers.set(agentId, timer);
  }

  private publishWorkerUpdate(worker: WorkerInfo): void {
    this.lastUpdateAt.set(worker.agentId, Date.now());
    this.withStanding(worker, this.updateTarget());
    const socketService = tryInject('socketService');
    if (!socketService) return;

    socketService.io.of('/workers').emit('worker-update', worker);

    const workersNsp = socketService.namespaces.get('/workers') as WorkersNamespace | undefined;
    workersNsp?.handleWorkerUpdate(worker);

    const serverNsp = socketService.namespaces.get('/server') as ServerNamespace | undefined;
    serverNsp?.refreshWorkerUpdateAvailable();
  }
}
