import { Logger } from '@camera.ui/common/logger';
import { isEqual, SignalHandler } from '@camera.ui/common/utils';
import { createRPCClient } from '@camera.ui/rpc';
import { processes } from 'systeminformation';
import { container } from 'tsyringe';

import { WorkersService } from '../api/services/workers.service.js';
import { NamespaceManager } from '../rpc/namespaces.js';
import { ConfigService } from '../services/config/index.js';
import { FrameDecodingHandler } from './capabilities/frame-decoding.js';
import { PluginHostHandler } from './capabilities/plugin-host.js';
import { WorkerCapability, workloadKey } from './types.js';

import type { LogEntry, LoggerOptions } from '@camera.ui/common/logger';
import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type { NATS } from '../rpc/server.js';
import type { CapabilityHandler } from './capabilities/handler.js';
import type { WorkerAgentRPC, WorkerHealthInfo, WorkerHeartbeat, WorkerManagerRPC, WorkerSyncResponse, WorkloadSpec } from './types.js';

const SYNC_INTERVAL_MS = 5_000;

export class WorkerAgent implements WorkerAgentRPC {
  public readonly agentId: string;
  public readonly capabilities: WorkerCapability[];

  private readonly logger: Logger;
  private readonly configService: ConfigService;
  private readonly natsServer: NATS;
  private readonly startTime = Date.now();

  private proxy!: RPCClient;
  private managerProxy!: Promisify<WorkerManagerRPC>;
  private handlers = new Map<WorkerCapability, CapabilityHandler>();

  private pluginHostHandler?: PluginHostHandler;

  private applied = new Map<string, WorkloadSpec>();
  private syncInterval?: NodeJS.Timeout;
  private syncInFlight = false;
  private syncQueued = false;
  private isClosed = false;

  private closeHandler?: () => Promise<void>;
  private unsubscribeSync?: () => void;
  private signalHandler: SignalHandler;

  private cpuLoad = '0.00';
  private memLoad = '0.00';

  constructor() {
    this.configService = container.resolve<ConfigService>('configService');
    this.natsServer = container.resolve<NATS>('natsServer');

    const workerName = this.configService.config.worker?.name ?? 'worker';
    this.agentId = new WorkersService().getOrCreateAgentId(workerName);

    const allCapabilities = Object.values(WorkerCapability);
    const validCapabilities = new Set(allCapabilities as string[]);
    const configuredCapabilities = this.configService.config.worker?.capabilities ?? [];
    this.capabilities =
      configuredCapabilities.length === 0 ? allCapabilities : (configuredCapabilities.filter((cap) => validCapabilities.has(cap)) as WorkerCapability[]);

    const loggerOptions: LoggerOptions = {
      prefix: 'WorkerAgent',
      suffix: this.configService.config.worker?.name ?? 'worker',
      debugEnabled: this.configService.config.logger?.level === 'debug' || this.configService.config.logger?.level === 'trace',
      traceEnabled: this.configService.config.logger?.level === 'trace',
    };

    this.logger = new Logger(loggerOptions);

    this.signalHandler = new SignalHandler({
      displayName: '[WorkerAgent]',
      timeoutDuration: 5000,
      logger: this.logger,
      closeFunction: this.close.bind(this),
    });
  }

  public async start(): Promise<void> {
    this.logger.log(`Starting WorkerAgent (id: ${this.agentId})`);

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

    // Local NATS (leaf node)
    this.proxy = createRPCClient({
      name: `worker-agent-${this.agentId}`,
      servers: this.natsServer.endpoints.filter((ep) => ep.startsWith('nats://')),
      timeout: 10_000,
      auth: {
        user: this.natsServer.localAuth.user,
        password: this.natsServer.localAuth.password,
      },
    });

    await this.proxy.connect();

    for (const cap of this.capabilities) {
      switch (cap) {
        case WorkerCapability.FrameDecoding:
          this.handlers.set(cap, new FrameDecodingHandler(this.natsServer, this.configService, this.logger, (entry) => this.forwardLog(entry)));
          break;
        case WorkerCapability.PluginHost:
          this.pluginHostHandler = new PluginHostHandler(this.configService, this.logger, (entry) => this.forwardLog(entry));
          this.handlers.set(cap, this.pluginHostHandler);
          break;
        default:
          this.logger.warn(`No handler for capability: ${cap}`);
      }
    }

    this.managerProxy = this.proxy.createProxy<WorkerManagerRPC>(NamespaceManager.workerManagerRpc());

    const rpcSubject = NamespaceManager.workerAgentRpc(this.agentId);
    this.closeHandler = await this.proxy.registerHandler(
      rpcSubject,
      { ping: () => this.ping(), restart: () => this.restart() },
      { isolatedConnection: true, withoutDecorators: true },
    );

    this.unsubscribeSync = await this.proxy.subscribe(NamespaceManager.workerSync(this.agentId), () => {
      this.syncCycle();
    });

    this.syncCycle();
    this.syncInterval = setInterval(() => this.syncCycle(), SYNC_INTERVAL_MS);

    this.logger.log('WorkerAgent started and ready for commands');
  }

  public async close(): Promise<void> {
    this.logger.log('Shutting down WorkerAgent...');

    this.isClosed = true;

    try {
      this.proxy.publish(NamespaceManager.workerDisconnect(), { agentId: this.agentId });
    } catch {
      // best-effort — proxy might already be disconnected
    }

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }

    this.unsubscribeSync?.();

    for (const handler of this.handlers.values()) {
      await handler.stopAll();
    }

    await this.closeHandler?.();
    await this.proxy?.disconnect();

    this.logger.log('WorkerAgent shut down');
  }

  public async ping(): Promise<WorkerHealthInfo> {
    return {
      agentId: this.agentId,
      name: this.configService.config.worker?.name ?? 'worker',
      uptime: Date.now() - this.startTime,
      cameras: Array.from(this.handlers.values()).flatMap((h) => h.getActiveWorkIds()),
      capabilities: this.capabilities,
    };
  }

  public async restart(): Promise<void> {
    this.logger.log('Restart requested — shutting down gracefully');

    // Defer so the RPC response is sent before the connection drops
    setTimeout(async () => {
      await this.close();
      process.exit(0);
    }, 100);
  }

  private async syncCycle(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    if (this.syncInFlight) {
      this.syncQueued = true;
      return;
    }

    this.syncInFlight = true;

    try {
      await this.sampleMetrics();

      let response: WorkerSyncResponse;
      try {
        response = await this.managerProxy.heartbeat(this.buildHeartbeat());
      } catch {
        // Master unreachable — keep running the current workloads and try
        // again on the next cycle. Convergence resumes when it is back.
        return;
      }

      await this.reconcile(response?.workloads ?? []);
    } finally {
      this.syncInFlight = false;

      if (this.syncQueued) {
        this.syncQueued = false;
        this.syncCycle();
      }
    }
  }

  private async reconcile(desired: WorkloadSpec[]): Promise<void> {
    if (this.isClosed) {
      return;
    }

    const desiredByKey = new Map<string, WorkloadSpec>();
    for (const workload of desired) {
      if (!this.handlers.has(workload.capability)) {
        continue;
      }
      desiredByKey.set(workloadKey(workload.capability, workload.id), workload);
    }

    // Stop strays first — the single-owner invariant matters more than a gap.
    for (const [key, applied] of this.applied) {
      if (desiredByKey.has(key)) {
        continue;
      }

      try {
        await this.handlers.get(applied.capability)?.stop(applied.id);
        this.applied.delete(key);
      } catch (error: any) {
        this.logger.error(`Failed to stop workload ${key}:`, error.message);
      }
    }

    for (const [key, workload] of desiredByKey) {
      const current = this.applied.get(key);
      if (current?.revision === workload.revision && isEqual(current?.spec, workload.spec)) {
        continue;
      }

      try {
        await this.handlers.get(workload.capability)?.start(workload.id, workload.spec);
        this.applied.set(key, workload);
      } catch (error: any) {
        // Not recorded as applied — retried on the next cycle.
        this.logger.error(`Failed to start workload ${key}:`, error.message);
      }
    }
  }

  private buildHeartbeat(): WorkerHeartbeat {
    return {
      agentId: this.agentId,
      name: this.configService.config.worker?.name ?? 'worker',
      cameras: Array.from(this.handlers.values()).flatMap((h) => h.getActiveWorkIds()),
      uptime: Date.now() - this.startTime,
      capabilities: this.capabilities,
      version: ConfigService.RUNNING_VERSION,
      platform: { os: process.platform, arch: process.arch },
      pid: process.pid,
      cpuLoad: this.cpuLoad,
      memLoad: this.memLoad,
      plugins: this.pluginHostHandler?.getPluginStatuses(),
    };
  }

  private async sampleMetrics(): Promise<void> {
    try {
      const pids = new Set<number>([process.pid]);
      for (const handler of this.handlers.values()) {
        for (const pid of handler.getActiveProcessIds()) {
          pids.add(pid);
        }
      }

      const all = await processes();

      let cpu = 0;
      let mem = 0;
      for (const proc of all.list) {
        if (pids.has(proc.pid)) {
          cpu += proc.cpu || 0;
          mem += proc.mem || 0;
        }
      }

      this.cpuLoad = Math.min(cpu, 100).toFixed(2);
      this.memLoad = Math.min(mem, 100).toFixed(2);
    } catch {
      // keep last sample
    }
  }

  private forwardLog(entry: LogEntry): void {
    try {
      this.proxy.publish(NamespaceManager.workerLogs(), entry);
    } catch {
      // master will miss this line — local trace still has it
    }
  }
}
