import { Logger } from '@camera.ui/common/logger';
import { container } from 'tsyringe';

import { CamerasService } from '../api/services/cameras.service.js';
import { PluginsService } from '../api/services/plugins.service.js';
import { WorkersService } from '../api/services/workers.service.js';
import { NamespaceManager } from '../rpc/namespaces.js';
import { ConfigService } from '../services/config/index.js';
import { describePlatformRequirement, isPlatformCompatible } from '../utils/platform.js';
import { WorkerCapability, workloadKey } from './types.js';

import type { LogEntry, LoggerOptions } from '@camera.ui/common/logger';
import type { Promisify } from '@camera.ui/rpc';
import type { CameraUiAPI } from '../api.js';
import type { SocketService } from '../api/websocket/index.js';
import type { WorkersNamespace } from '../api/websocket/nsp/workers.js';
import type { ProxyServer } from '../rpc/index.js';
import type { LogManager } from '../services/logger/logManager.js';
import type { RemoteCameraConfig, RemotePluginConfig, WorkerAgentRPC, WorkerHeartbeat, WorkerInfo, WorkerSyncResponse, WorkloadSpec } from './types.js';

const WORKER_TIMEOUT_MS = 15_000;

export class WorkerManager {
  private readonly logger: Logger;
  private readonly configService: ConfigService;
  private readonly camerasService: CamerasService;
  private readonly workersService: WorkersService;
  private readonly proxyServer: ProxyServer;

  private workers = new Map<string, WorkerInfo>();
  private desired = new Map<string, { agentId: string; workload: WorkloadSpec }>();

  private closeHeartbeatHandler?: () => Promise<void>;
  private unsubscribeDisconnect?: () => void;
  private unsubscribeLogs?: () => void;
  private timeoutCheckInterval?: NodeJS.Timeout;
  private addressWarned = false;
  private workloadRevision = 0;
  private active = false;

  constructor() {
    container.registerInstance('workerManager', this);

    this.configService = container.resolve<ConfigService>('configService');
    this.proxyServer = container.resolve<ProxyServer>('proxy');

    const loggerOptions: LoggerOptions = {
      prefix: 'WorkerManager',
      debugEnabled: this.configService.config.logger?.level === 'debug' || this.configService.config.logger?.level === 'trace',
      traceEnabled: this.configService.config.logger?.level === 'trace',
    };

    this.logger = new Logger(loggerOptions);
    this.camerasService = new CamerasService();
    this.workersService = new WorkersService();
  }

  public isEnabled(): boolean {
    return this.active;
  }

  public async start(): Promise<void> {
    if (this.configService.config.workers?.enabled) {
      await this.enable(false);
    }
  }

  public async enable(reconcileAcceptor = true): Promise<void> {
    if (this.active) {
      return;
    }

    this.logger.log('Enabling WorkerManager');
    this.active = true;

    this.seedKnownWorkers();

    const proxy = this.proxyServer.proxy;
    if (!proxy) {
      throw new Error('WorkerManager enabled before the proxy was initialized');
    }

    this.closeHeartbeatHandler = await proxy.registerHandler(
      NamespaceManager.workerManagerRpc(),
      { heartbeat: (heartbeat: WorkerHeartbeat) => this.handleHeartbeat(heartbeat) },
      { withoutDecorators: true },
    );

    const unsubDisconnectPromise = proxy.subscribe(NamespaceManager.workerDisconnect(), (data: { agentId: string }) => {
      this.handleGracefulDisconnect(data.agentId);
    });

    unsubDisconnectPromise.then((unsub) => {
      this.unsubscribeDisconnect = unsub;
    });

    const unsubLogsPromise = proxy.subscribe(NamespaceManager.workerLogs(), (entry: LogEntry) => {
      this.handleForwardedLog(entry);
    });

    unsubLogsPromise.then((unsub) => {
      this.unsubscribeLogs = unsub;
    });

    this.timeoutCheckInterval = setInterval(() => this.checkTimeouts(), 5_000);

    if (reconcileAcceptor) {
      // Bring up the leaf-acceptor if workers are already paired.
      await this.proxyServer.applyLeafNodeAuth();
    }

    this.logger.log('WorkerManager enabled');
  }

  public async disable(): Promise<void> {
    if (!this.active) {
      return;
    }

    this.logger.log('Disabling WorkerManager');

    const agentIds = Array.from(this.workers.keys());

    await this.teardown();
    this.active = false;

    const pluginsService = new PluginsService();
    for (const agentId of agentIds) {
      for (const camera of this.camerasService.listByAgentId(agentId)) {
        this.restartFrameWorker(camera._id);
      }
      for (const plugin of pluginsService.listByAgentId(agentId)) {
        this.restartPluginWorker(plugin.pluginName);
      }
    }

    await this.proxyServer.applyLeafNodeAuth();

    this.logger.log('WorkerManager disabled');
  }

  public async stop(): Promise<void> {
    await this.teardown();
    this.active = false;
  }

  private async teardown(): Promise<void> {
    if (this.timeoutCheckInterval) {
      clearInterval(this.timeoutCheckInterval);
      this.timeoutCheckInterval = undefined;
    }

    await this.closeHeartbeatHandler?.();
    this.closeHeartbeatHandler = undefined;
    this.unsubscribeDisconnect?.();
    this.unsubscribeDisconnect = undefined;
    this.unsubscribeLogs?.();
    this.unsubscribeLogs = undefined;
    this.workers.clear();
    this.desired.clear();
  }

  public getWorkers(): WorkerInfo[] {
    return Array.from(this.workers.values());
  }

  public isWorkerOnline(agentId: string): boolean {
    const worker = this.workers.get(agentId);
    return worker?.online === true;
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

  public async restartWorker(agentId: string): Promise<void> {
    if (!this.isWorkerOnline(agentId)) {
      throw new Error(`Worker ${agentId} is not online`);
    }
    const workerProxy = this.createWorkerProxy(agentId);
    await workerProxy.restart();
  }

  public async assignCamera(cameraId: string, agentId: string): Promise<void> {
    this.logger.log(`Assigning camera ${cameraId} to worker ${agentId}`);

    const camera = this.camerasService.findById(cameraId);
    if (!camera) {
      throw new Error(`Camera ${cameraId} not found`);
    }

    await this.camerasService.setWorkerAgentId(cameraId, agentId);
    this.restartFrameWorker(cameraId);
  }

  public async unassignCamera(cameraId: string): Promise<void> {
    this.logger.log(`Unassigning camera ${cameraId}`);

    const camera = this.camerasService.findById(cameraId);
    if (!camera) {
      throw new Error(`Camera ${cameraId} not found`);
    }

    await this.camerasService.setWorkerAgentId(cameraId, undefined);
    this.restartFrameWorker(cameraId);
  }

  public async noteWorkerPaired(agentId: string, name: string): Promise<void> {
    await this.workersService.rememberWorker(agentId, name);

    if (!this.workers.has(agentId)) {
      const workerInfo: WorkerInfo = {
        agentId,
        name,
        online: false,
        lastHeartbeat: Date.now(),
        cameras: [],
        capabilities: [],
      };
      this.workers.set(agentId, workerInfo);
      this.emitWorkerUpdate(workerInfo);
    }
  }

  public async assignPlugin(pluginName: string, agentId: string): Promise<void> {
    this.logger.log(`Assigning plugin ${pluginName} to worker ${agentId}`);

    const pluginsService = new PluginsService();
    const plugin = pluginsService.getPluginByName(pluginName);
    if (!plugin) {
      throw new Error(`Plugin ${pluginName} not found`);
    }

    const worker = this.workers.get(agentId);
    if (!worker) {
      throw new Error(`Worker ${agentId} is unknown`);
    }

    // Reject obviously wrong placements early; if the worker's platform is
    // still unknown (never heartbeated) the agent double-checks on its side.
    if (worker.platform && !isPlatformCompatible(plugin.info.os, plugin.info.cpu, worker.platform.os, worker.platform.arch)) {
      const requirement = describePlatformRequirement(plugin.info.os, plugin.info.cpu);
      throw new Error(`Plugin ${pluginName} requires ${requirement} — worker ${worker.name} is ${worker.platform.os}/${worker.platform.arch}`);
    }

    await pluginsService.setWorkerAgentId(pluginName, agentId);
    this.restartPluginWorker(pluginName);
  }

  public async unassignPlugin(pluginName: string): Promise<void> {
    this.logger.log(`Unassigning plugin ${pluginName}`);

    const pluginsService = new PluginsService();
    await pluginsService.setWorkerAgentId(pluginName, undefined);
    this.restartPluginWorker(pluginName);
  }

  public getPluginAssignment(pluginName: string): string | undefined {
    return new PluginsService().getPluginDbByName(pluginName)?.workerAgentId;
  }

  public async removeWorker(agentId: string): Promise<void> {
    this.logger.log(`Removing worker ${agentId}`);

    for (const camera of this.camerasService.listByAgentId(agentId)) {
      await this.camerasService.setWorkerAgentId(camera._id, undefined);
      this.restartFrameWorker(camera._id);
    }

    const pluginsService = new PluginsService();
    for (const plugin of pluginsService.listByAgentId(agentId)) {
      await pluginsService.setWorkerAgentId(plugin.pluginName, undefined);
      this.restartPluginWorker(plugin.pluginName);
    }

    const hadCredentials = await this.workersService.revokeCredentials(agentId);
    await this.workersService.forgetWorker(agentId);
    this.workers.delete(agentId);

    try {
      const socketService = container.resolve<SocketService>('socketService');
      socketService.io.of('/workers').emit('worker-removed', { agentId });

      const workersNsp = socketService.namespaces.get('/workers') as WorkersNamespace | undefined;
      workersNsp?.handleWorkerRemoved(agentId);
    } catch {
      // SocketService may not be available yet during startup
    }

    if (hadCredentials) {
      await this.proxyServer.applyLeafNodeAuth();
    }
  }

  public desireFrameDecoding(cameraId: string): string | undefined {
    if (!this.active) {
      return undefined;
    }

    const agentId = this.getAssignment(cameraId);
    if (!agentId || !this.isWorkerOnline(agentId)) {
      return undefined;
    }

    if (!this.configService.config.workers?.address) {
      if (!this.addressWarned) {
        this.addressWarned = true;
        this.logger.warn("workers.address is not configured — remote workers cannot reach this master's streams, running cameras locally");
      }
      return undefined;
    }

    const spec = this.buildRemoteCameraConfig(cameraId);
    if (!spec) {
      return undefined;
    }

    this.desired.set(workloadKey(WorkerCapability.FrameDecoding, cameraId), {
      agentId,
      workload: { id: cameraId, capability: WorkerCapability.FrameDecoding, spec, revision: ++this.workloadRevision },
    });

    this.nudge(agentId);
    return agentId;
  }

  public clearFrameDecoding(cameraId: string): void {
    this.clearWorkload(WorkerCapability.FrameDecoding, cameraId);
  }

  public desirePluginHost(pluginName: string): string | undefined {
    if (!this.active) {
      return undefined;
    }

    const agentId = this.getPluginAssignment(pluginName);
    if (!agentId || !this.isWorkerOnline(agentId)) {
      return undefined;
    }

    const plugin = new PluginsService().getPluginByName(pluginName);
    if (!plugin) {
      return undefined;
    }

    const worker = this.workers.get(agentId);
    if (worker?.platform && !isPlatformCompatible(plugin.info.os, plugin.info.cpu, worker.platform.os, worker.platform.arch)) {
      this.logger.warn(`Plugin ${pluginName} is assigned to worker ${worker.name} but incompatible with its platform — not delegating`);
      return undefined;
    }

    const rtsp = this.configService.go2rtcConfig.rtsp;
    const spec: RemotePluginConfig = {
      pluginId: plugin.id,
      pluginName,
      version: plugin.info.installedVersion ?? 'latest',
      displayName: plugin.displayName,
      loggerLevel: this.configService.config.logger.level,
      rtspUsername: rtsp.username,
      rtspPassword: rtsp.password,
    };

    this.desired.set(workloadKey(WorkerCapability.PluginHost, pluginName), {
      agentId,
      workload: { id: pluginName, capability: WorkerCapability.PluginHost, spec, revision: ++this.workloadRevision },
    });

    this.nudge(agentId);
    return agentId;
  }

  public clearPluginHost(pluginName: string): void {
    this.clearWorkload(WorkerCapability.PluginHost, pluginName);
  }

  private clearWorkload(capability: WorkerCapability, id: string): void {
    const key = workloadKey(capability, id);
    const entry = this.desired.get(key);
    if (!entry) {
      return;
    }

    this.desired.delete(key);
    this.nudge(entry.agentId);
  }

  private createWorkerProxy(agentId: string): Promisify<WorkerAgentRPC> {
    const proxy = this.proxyServer.proxy;
    if (!proxy) {
      throw new Error('Proxy is not initialized');
    }
    const rpcSubject = NamespaceManager.workerAgentRpc(agentId);
    return proxy.createProxy<WorkerAgentRPC>(rpcSubject);
  }

  private nudge(agentId: string): void {
    try {
      this.proxyServer.proxy?.publish(NamespaceManager.workerSync(agentId), {});
    } catch {
      // agent will converge on its next heartbeat anyway
    }
  }

  private restartFrameWorker(cameraId: string): void {
    const api = container.resolve<CameraUiAPI>('api');
    api.cameraControllers
      .get(cameraId)
      ?.frameWorker.restart()
      .catch((error: any) => {
        this.logger.error(`Failed to restart FrameWorker for camera ${cameraId}:`, error);
      });
  }

  private restartPluginWorker(pluginName: string): void {
    new PluginsService()
      .getPluginProcessByName(pluginName)
      ?.restart()
      .catch((error: any) => {
        this.logger.error(`Failed to restart plugin ${pluginName}:`, error);
      });
  }

  private buildRemoteCameraConfig(cameraId: string): RemoteCameraConfig | undefined {
    const api = container.resolve<CameraUiAPI>('api');
    const controller = api.cameraControllers.get(cameraId);
    if (!controller) {
      return undefined;
    }

    return {
      cameraId,
      cameraName: controller.name,
      loggerLevel: this.configService.config.logger.level,
    };
  }

  private handleHeartbeat(heartbeat: WorkerHeartbeat): WorkerSyncResponse {
    const existing = this.workers.get(heartbeat.agentId);
    const versionMismatch = heartbeat.version !== ConfigService.RUNNING_VERSION;

    if (!existing?.online) {
      this.logger.log(`Worker ${existing ? 'reconnected' : 'connected'}: ${heartbeat.name} (${heartbeat.agentId})`);
    }

    if (versionMismatch && !existing?.versionMismatch) {
      const workerVersion = heartbeat.version || 'unknown';
      this.logger.warn(`Worker ${heartbeat.name} (${heartbeat.agentId}) runs version ${workerVersion}, master runs ${ConfigService.RUNNING_VERSION} — update the worker`);
    }

    const wasOffline = !existing?.online;

    const workerInfo: WorkerInfo = {
      agentId: heartbeat.agentId,
      name: heartbeat.name,
      online: true,
      lastHeartbeat: Date.now(),
      cameras: heartbeat.cameras,
      capabilities: heartbeat.capabilities ?? [],
      version: heartbeat.version,
      versionMismatch,
      platform: heartbeat.platform,
      pid: heartbeat.pid,
      cpuLoad: heartbeat.cpuLoad,
      memLoad: heartbeat.memLoad,
    };

    this.workers.set(heartbeat.agentId, workerInfo);
    this.emitWorkerUpdate(workerInfo);

    this.workersService.rememberWorker(heartbeat.agentId, heartbeat.name).catch(() => {});

    if (wasOffline) {
      this.onWorkerOnline(heartbeat.agentId);
    }

    return { workloads: this.desiredFor(heartbeat.agentId) };
  }

  private desiredFor(agentId: string): WorkloadSpec[] {
    const workloads: WorkloadSpec[] = [];
    for (const entry of this.desired.values()) {
      if (entry.agentId === agentId) {
        workloads.push(entry.workload);
      }
    }
    return workloads;
  }

  private seedKnownWorkers(): void {
    for (const known of this.workersService.listKnownWorkers()) {
      this.workers.set(known.agentId, {
        agentId: known.agentId,
        name: known.name,
        online: false,
        lastHeartbeat: known.lastSeen,
        cameras: [],
        capabilities: [],
      });
    }
  }

  private handleGracefulDisconnect(agentId: string): void {
    const worker = this.workers.get(agentId);
    if (!worker?.online) return;

    this.logger.log(`Worker ${worker.name} (${agentId}) disconnected gracefully`);
    worker.online = false;
    this.emitWorkerUpdate(worker);
    this.onWorkerOffline(agentId);
  }

  private checkTimeouts(): void {
    const now = Date.now();

    for (const [agentId, worker] of this.workers) {
      if (worker.online && now - worker.lastHeartbeat > WORKER_TIMEOUT_MS) {
        this.logger.warn(`Worker ${worker.name} (${agentId}) timed out — checking failover`);
        worker.online = false;
        this.emitWorkerUpdate(worker);
        this.onWorkerOffline(agentId);
      }
    }
  }

  private handleForwardedLog(entry: LogEntry): void {
    try {
      const logManager = container.resolve<LogManager>('logManager');
      logManager.handleChildLog(entry);
    } catch {
      // LogManager may not be available yet during startup
    }
  }

  private emitWorkerUpdate(worker: WorkerInfo): void {
    try {
      const socketService = container.resolve<SocketService>('socketService');
      socketService.io.of('/workers').emit('worker-update', worker);

      // Push to WorkersNamespace for history accumulation
      const workersNsp = socketService.namespaces.get('/workers') as WorkersNamespace | undefined;
      workersNsp?.handleWorkerUpdate(worker);
    } catch {
      // SocketService may not be available yet during startup
    }
  }

  private onWorkerOnline(agentId: string): void {
    const api = container.resolve<CameraUiAPI>('api');

    for (const camera of this.camerasService.listByAgentId(agentId)) {
      const controller = api.cameraControllers.get(camera._id);
      if (!controller) continue;

      // Camera is running on a local fallback fork — re-home it to the worker
      // that just came (back) online.
      if (!controller.frameWorker.isRemoteWorker) {
        this.logger.log(`Worker ${agentId} online — re-homing FrameWorker for ${camera.name}`);
        this.restartFrameWorker(camera._id);
      }
    }

    const pluginsService = new PluginsService();
    for (const plugin of pluginsService.listByAgentId(agentId)) {
      const process = pluginsService.getPluginProcessByName(plugin.pluginName);
      if (!process || process.isRemoteWorker) continue;

      this.logger.log(`Worker ${agentId} online — re-homing plugin ${plugin.pluginName}`);
      this.restartPluginWorker(plugin.pluginName);
    }
  }

  private onWorkerOffline(agentId: string): void {
    const api = container.resolve<CameraUiAPI>('api');

    for (const camera of this.camerasService.listByAgentId(agentId)) {
      const controller = api.cameraControllers.get(camera._id);
      if (!controller) continue;

      // Worker gone — restart re-runs placement and falls back to a local fork.
      this.logger.log(`Worker ${agentId} offline — falling back to local FrameWorker for ${camera.name}`);
      this.restartFrameWorker(camera._id);
    }

    const pluginsService = new PluginsService();
    for (const plugin of pluginsService.listByAgentId(agentId)) {
      const process = pluginsService.getPluginProcessByName(plugin.pluginName);
      if (!process?.isRemoteWorker) continue;

      // Restart re-runs placement — falls back to local only if compatible.
      this.logger.log(`Worker ${agentId} offline — re-placing plugin ${plugin.pluginName}`);
      this.restartPluginWorker(plugin.pluginName);
    }
  }
}
