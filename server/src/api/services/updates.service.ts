import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { APP_SERVER_NAME, IS_ELECTRON, sleep } from '@camera.ui/common/utils';
import { pathExists, readJson, remove, writeJson } from 'fs-extra/esm';
import { lt, valid } from 'semver';
import { container } from 'tsyringe';

import { ConfigService } from '../../services/config/index.js';
import { appUpdateState, requestAppUpdateCheck } from '../../utils/ipc.js';
import { PluginsService } from './plugins.service.js';
import { ServerService } from './server.service.js';

import type { LoggerService } from '../../services/logger/index.js';
import type { WorkerManager } from '../../workers/manager.js';
import type { SocketService } from '../websocket/index.js';
import type { ServerNamespace } from '../websocket/nsp/server.js';

export type UpdatesItemKind = 'server' | 'plugin' | 'worker';
export type UpdatesItemStatus = 'pending' | 'updating' | 'restarting' | 'success' | 'error';
export type UpdatesBlockedReason = 'desktop' | 'legacy';

export interface UpdatesActivityItem {
  id: string;
  kind: UpdatesItemKind;
  name: string;
  status: UpdatesItemStatus;
  source: 'run' | 'manual';
  installedVersion?: string;
  targetVersion?: string;
  error?: string;
}

export interface UpdatesRunState {
  id: string;
  active: boolean;
  cancelRequested: boolean;
  startedAt: number;
  finishedAt?: number;
  items: UpdatesActivityItem[];
}

export interface UpdatesPendingWorker {
  agentId: string;
  name: string;
  installedVersion?: string;
  updateAvailable: boolean;
  updatable: boolean;
  blockedReason?: UpdatesBlockedReason;
}

export interface UpdatesPendingPlugin {
  pluginName: string;
  displayName: string;
  installedVersion?: string;
  latestVersion?: string;
  updateAvailable: boolean;
}

export interface UpdatesPending {
  server: { installedVersion: string; latestVersion?: string; updateAvailable: boolean; blockedReason?: UpdatesBlockedReason };
  plugins: UpdatesPendingPlugin[];
  workers: UpdatesPendingWorker[];
  targetServerVersion: string;
}

export interface UpdatesStatus {
  run: UpdatesRunState | null;
  lastRun: UpdatesRunState | null;
  manual: UpdatesActivityItem[];
  pending: UpdatesPending;
}

interface UpdatesStamp {
  runId?: string;
  previousVersion: string;
  expectedVersion?: string;
  items: UpdatesActivityItem[];
  startedAt: number;
}

export class UpdatesLockedError extends Error {
  public readonly statusCode = 409;
}

const WORKER_UPDATE_TIMEOUT_MS = 10 * 60 * 1000;
const WORKER_POLL_MS = 2_000;
const CHECK_TTL_MS = 60_000;
const MANUAL_ITEM_LINGER_MS = 60_000;
const STAMP_FILE = 'updates-run.json';

let instance: UpdatesService | null = null;

export function updatesService(): UpdatesService {
  instance ??= new UpdatesService();
  return instance;
}

export class UpdatesService {
  private logger: LoggerService;
  private configService: ConfigService;

  private run: UpdatesRunState | null = null;
  private lastRun: UpdatesRunState | null = null;
  private manual = new Map<string, UpdatesActivityItem>();
  private manualCleanupTimers = new Map<string, NodeJS.Timeout>();
  private serverInstallActive = false;
  private workerPollTimer: NodeJS.Timeout | undefined;
  private lastCheckAt = 0;

  constructor() {
    this.logger = container.resolve<LoggerService>('logger');
    this.configService = container.resolve<ConfigService>('configService');
  }

  public async init(): Promise<void> {
    await this.resolveStamp();
    this.emitStatus();
  }

  public isRunActive(): boolean {
    return this.run?.active === true;
  }

  public assertManualAllowed(kind: UpdatesItemKind): void {
    if (this.isRunActive()) {
      throw new UpdatesLockedError('An update run is in progress. Wait for it to finish.');
    }

    if (kind === 'server') {
      const activity = [...this.manual.values()].some((item) => item.status === 'updating' || item.status === 'restarting');
      if (activity || this.anyWorkerUpdating()) {
        throw new UpdatesLockedError('The server can only update while no other update is running.');
      }
      return;
    }

    if (this.serverInstallActive) {
      throw new UpdatesLockedError('A server update is in progress. Wait for it to finish.');
    }
  }

  public notifyPluginManage(pluginName: string, phase: 'start' | 'success' | 'error', detail?: { version?: string; error?: string; source?: 'run' | 'manual' }): void {
    this.notifyActivity('plugin', `plugin:${pluginName}`, pluginName, phase, detail);
  }

  public notifyServerInstall(phase: 'start' | 'success' | 'error', detail?: { version?: string; error?: string; source?: 'run' | 'manual' }): void {
    this.serverInstallActive = phase === 'start';
    this.notifyActivity('server', 'server', APP_SERVER_NAME, phase === 'success' ? 'restarting' : phase, detail);

    if (phase === 'success' && detail?.source !== 'run' && !this.runItem('server')) {
      const item = this.manual.get('server');
      this.writeStamp({
        previousVersion: ConfigService.VERSION,
        expectedVersion: detail?.version,
        items: item ? [item] : [],
        startedAt: Date.now(),
      });
    }
  }

  public notifyWorkerUpdate(agentId: string, name: string, targetVersion?: string): void {
    this.notifyActivity('worker', `worker:${agentId}`, name, 'start', { version: targetVersion });
    this.ensureWorkerPoll();
  }

  public status(): UpdatesStatus {
    return {
      run: this.run,
      lastRun: this.lastRun,
      manual: [...this.manual.values()],
      pending: this.pending(),
    };
  }

  public async checkNow(): Promise<void> {
    if (Date.now() - this.lastCheckAt < CHECK_TTL_MS) return;
    this.lastCheckAt = Date.now();

    const nsp = this.serverNamespace();
    if (IS_ELECTRON) {
      requestAppUpdateCheck();
      await nsp?.checkPlugins();
      await sleep(1500);
    } else {
      await Promise.all([nsp?.checkServer(), nsp?.checkPlugins()]);
    }
    nsp?.refreshWorkerUpdateAvailable();
  }

  public pending(): UpdatesPending {
    const pending: UpdatesPending = {
      server: { installedVersion: ConfigService.VERSION, updateAvailable: false },
      plugins: [],
      workers: [],
      targetServerVersion: ConfigService.RUNNING_VERSION,
    };

    const serverNsp = this.serverNamespace();
    const updates = serverNsp?.getUpdates();

    if (IS_ELECTRON) {
      const app = appUpdateState();
      pending.server = {
        installedVersion: app?.appVersion ?? ConfigService.VERSION,
        latestVersion: app?.version,
        updateAvailable: Boolean(app),
        blockedReason: app && !app.remoteInstall ? 'desktop' : undefined,
      };
    } else if (updates?.server && (updates.server.updateAvailable || updates.server.betaUpdateAvailable)) {
      pending.server = { installedVersion: ConfigService.VERSION, latestVersion: updates.server.latestVersion, updateAvailable: true };
      if (updates.server.latestVersion) {
        pending.targetServerVersion = updates.server.latestVersion;
      }
    }

    const pluginUpdates = new Map((updates?.plugins ?? []).filter((entry) => entry.pluginName).map((entry) => [entry.pluginName!, entry]));
    for (const plugin of new PluginsService().listPlugins()) {
      const update = pluginUpdates.get(plugin.info.pluginName);
      pending.plugins.push({
        pluginName: plugin.info.pluginName,
        displayName: plugin.info.displayName,
        installedVersion: plugin.info.installedVersion,
        latestVersion: update?.latestVersion ?? plugin.info.installedVersion,
        updateAvailable: update !== undefined,
      });
    }

    for (const worker of this.workerManager()?.getWorkers() ?? []) {
      if (!worker.online) continue;
      if (!this.workerBehindTarget(worker.version, pending.targetServerVersion, worker.versionMismatch === true)) {
        pending.workers.push({ agentId: worker.agentId, name: worker.name, installedVersion: worker.version, updateAvailable: false, updatable: true });
      } else if (worker.update?.updatable) {
        pending.workers.push({ agentId: worker.agentId, name: worker.name, installedVersion: worker.version, updateAvailable: true, updatable: true });
      } else {
        pending.workers.push({
          agentId: worker.agentId,
          name: worker.name,
          installedVersion: worker.version,
          updateAvailable: true,
          updatable: false,
          blockedReason: worker.update ? 'desktop' : 'legacy',
        });
      }
    }

    return pending;
  }

  public async runAll(): Promise<UpdatesRunState> {
    if (this.isRunActive()) {
      throw new UpdatesLockedError('An update run is already in progress.');
    }
    if (this.serverInstallActive || this.anyManualActive() || this.anyWorkerUpdating()) {
      throw new UpdatesLockedError('Manual updates are running. Wait for them to finish.');
    }

    const pending = this.pending();
    const serverPending = pending.server.updateAvailable && !pending.server.blockedReason;

    const items: UpdatesActivityItem[] = [
      ...pending.workers
        .filter((worker) => worker.updateAvailable && worker.updatable)
        .map<UpdatesActivityItem>((worker) => ({
          id: `worker:${worker.agentId}`,
          kind: 'worker',
          name: worker.name,
          status: 'pending',
          source: 'run',
          installedVersion: worker.installedVersion,
          targetVersion: pending.targetServerVersion,
        })),
      ...pending.plugins
        .filter((plugin) => plugin.updateAvailable)
        .map<UpdatesActivityItem>((plugin) => ({
          id: `plugin:${plugin.pluginName}`,
          kind: 'plugin',
          name: plugin.pluginName,
          status: 'pending',
          source: 'run',
          installedVersion: plugin.installedVersion,
          targetVersion: plugin.latestVersion,
        })),
      ...(serverPending
        ? [
            {
              id: 'server',
              kind: 'server',
              name: APP_SERVER_NAME,
              status: 'pending',
              source: 'run',
              installedVersion: pending.server.installedVersion,
              targetVersion: pending.server.latestVersion,
            } satisfies UpdatesActivityItem,
          ]
        : []),
    ];

    if (items.length === 0) {
      throw new Error('Nothing to update.');
    }

    this.run = {
      id: randomUUID(),
      active: true,
      cancelRequested: false,
      startedAt: Date.now(),
      items,
    };

    this.logger.log(`Update run started: ${items.length} target(s)${serverPending ? ', server last' : ''}`);
    this.emitStatus();

    this.executeRun(serverPending, pending.targetServerVersion);

    return this.run;
  }

  public cancelRun(): void {
    if (!this.isRunActive() || !this.run) return;
    this.run.cancelRequested = true;
    this.emitStatus();
  }

  private async executeRun(serverPending: boolean, targetServerVersion: string): Promise<void> {
    const run = this.run!;

    for (const item of run.items) {
      if (run.cancelRequested) break;

      try {
        if (item.kind === 'worker') {
          await this.runWorkerItem(item, targetServerVersion);
        } else if (item.kind === 'plugin') {
          await this.runPluginItem(item, serverPending);
        } else {
          await this.runServerItem(item, run);
          return;
        }
      } catch (error: any) {
        item.status = 'error';
        item.error = error?.message ?? String(error);
        this.logger.warn(`Update run: ${item.name} failed — ${item.error}`);
      }
      this.emitStatus();
    }

    this.finishRun();
    await this.refreshUpdateStates();
  }

  private async runWorkerItem(item: UpdatesActivityItem, targetVersion: string): Promise<void> {
    const manager = this.workerManager();
    if (!manager) throw new Error('Worker manager not available');

    const agentId = item.id.slice('worker:'.length);
    item.status = 'updating';
    this.emitStatus();

    await manager.updateWorker(agentId, targetVersion);

    const deadline = Date.now() + WORKER_UPDATE_TIMEOUT_MS;
    for (;;) {
      await sleep(WORKER_POLL_MS);
      const worker = manager.getWorkers().find((entry) => entry.agentId === agentId);
      if (worker?.update && !worker.update.updating) {
        if (worker.update.error) throw new Error(worker.update.error);
        item.status = 'success';
        item.installedVersion = worker.version;
        return;
      }
      if (Date.now() > deadline) {
        throw new Error('Timed out waiting for the worker to finish updating');
      }
    }
  }

  private async runPluginItem(item: UpdatesActivityItem, serverPending: boolean): Promise<void> {
    item.status = 'updating';
    this.emitStatus();

    // with a server update ahead the restart brings the plugins up anyway
    await new PluginsService().manage(item.name, 'update', item.targetVersion, undefined, { internal: true, restart: !serverPending });
    item.status = 'success';
    item.installedVersion = item.targetVersion;
  }

  private async runServerItem(item: UpdatesActivityItem, run: UpdatesRunState): Promise<void> {
    item.status = 'updating';
    this.emitStatus();

    await this.writeStamp({
      runId: run.id,
      previousVersion: ConfigService.VERSION,
      expectedVersion: item.targetVersion,
      items: run.items,
      startedAt: run.startedAt,
    });

    try {
      await new ServerService().install(item.targetVersion ?? 'latest', { internal: true });
    } catch (error: any) {
      await this.clearStamp();
      item.status = 'error';
      item.error = error?.message ?? String(error);
      this.finishRun();
      await this.refreshUpdateStates();
      return;
    }

    item.status = 'restarting';
    this.finishRun();
    this.logger.log('Update run: server updated, restarting to apply');

    setTimeout(() => process.kill(process.pid, 'SIGTERM'), 1_000);
  }

  private finishRun(): void {
    if (!this.run) return;
    this.run.active = false;
    this.run.finishedAt = Date.now();
    this.lastRun = this.run;
    this.emitStatus();
  }

  private notifyActivity(
    kind: UpdatesItemKind,
    id: string,
    name: string,
    phase: 'start' | 'success' | 'error' | 'restarting',
    detail?: { version?: string; error?: string; source?: 'run' | 'manual' },
  ): void {
    // run items are driven by the orchestrator itself
    if (detail?.source === 'run' || this.runItem(id)) {
      return;
    }

    const timer = this.manualCleanupTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.manualCleanupTimers.delete(id);
    }

    if (phase === 'start') {
      this.manual.set(id, { id, kind, name, status: 'updating', source: 'manual', targetVersion: detail?.version });
    } else {
      const item = this.manual.get(id) ?? { id, kind, name, status: 'updating', source: 'manual' as const };
      item.status = phase === 'restarting' ? 'restarting' : phase;
      item.error = detail?.error;
      this.manual.set(id, item);
      this.manualCleanupTimers.set(
        id,
        setTimeout(() => {
          this.manual.delete(id);
          this.manualCleanupTimers.delete(id);
          this.emitStatus();
        }, MANUAL_ITEM_LINGER_MS),
      );
    }

    this.emitStatus();
  }

  private runItem(id: string): UpdatesActivityItem | undefined {
    if (!this.run?.active) return undefined;
    return this.run.items.find((item) => item.id === id);
  }

  private anyManualActive(): boolean {
    return [...this.manual.values()].some((item) => item.status === 'updating' || item.status === 'restarting');
  }

  private anyWorkerUpdating(): boolean {
    return (this.workerManager()?.getWorkers() ?? []).some((worker) => worker.update?.updating === true);
  }

  private ensureWorkerPoll(): void {
    if (this.workerPollTimer) return;
    this.workerPollTimer = setInterval(() => {
      const manager = this.workerManager();
      const workers = manager?.getWorkers() ?? [];
      let anyUpdating = false;

      for (const [id, item] of this.manual) {
        if (item.kind !== 'worker' || item.status !== 'updating') continue;
        const agentId = id.slice('worker:'.length);
        const worker = workers.find((entry) => entry.agentId === agentId);
        if (worker?.update?.updating) {
          anyUpdating = true;
          continue;
        }
        this.notifyActivity('worker', id, item.name, worker?.update?.error ? 'error' : 'success', { error: worker?.update?.error });
      }

      if (!anyUpdating) {
        clearInterval(this.workerPollTimer);
        this.workerPollTimer = undefined;
        this.refreshUpdateStates();
      }
    }, WORKER_POLL_MS);
  }

  private emitStatus(): void {
    const socketService = this.socketService();
    if (!socketService) return;

    const items: { kind: UpdatesItemKind; name: string; status: UpdatesItemStatus }[] = [
      ...(this.run?.active ? this.run.items : (this.lastRun?.items ?? [])).map((item) => ({ kind: item.kind, name: item.name, status: item.status })),
      ...[...this.manual.values()].map((item) => ({ kind: item.kind, name: item.name, status: item.status })),
    ];

    const updating = items.some((item) => item.status === 'updating' || item.status === 'restarting');

    socketService.io.of('/camera.ui').emit('updates-status', {
      updating,
      runActive: this.run?.active === true,
      items,
    });
  }

  private async refreshUpdateStates(): Promise<void> {
    const serverNsp = this.serverNamespace();
    if (!serverNsp) return;
    try {
      await serverNsp.checkPlugins();
      await serverNsp.checkServer();
      serverNsp.refreshWorkerUpdateAvailable();
    } catch {
      // best-effort
    }
  }

  private stampPath(): string {
    return join(this.configService.STORAGE_PATH, STAMP_FILE);
  }

  private async writeStamp(stamp: UpdatesStamp): Promise<void> {
    await writeJson(this.stampPath(), stamp);
  }

  private async clearStamp(): Promise<void> {
    await remove(this.stampPath()).catch(() => {});
  }

  private async resolveStamp(): Promise<void> {
    try {
      if (!(await pathExists(this.stampPath()))) return;
      const stamp = (await readJson(this.stampPath())) as UpdatesStamp;
      await this.clearStamp();

      const updated = ConfigService.VERSION !== stamp.previousVersion;
      const serverItem = stamp.items.find((item) => item.kind === 'server');
      if (serverItem) {
        serverItem.status = updated ? 'success' : 'error';
        serverItem.error = updated ? undefined : 'The server restarted without the update applied';
        serverItem.installedVersion = ConfigService.VERSION;
      }

      this.lastRun = {
        id: stamp.runId ?? randomUUID(),
        active: false,
        cancelRequested: false,
        startedAt: stamp.startedAt,
        finishedAt: Date.now(),
        items: stamp.items,
      };

      if (updated) {
        this.logger.log(`Update run finished: server now on ${ConfigService.VERSION}`);
      } else {
        this.logger.warn(`Update run: server still on ${ConfigService.VERSION} after the restart`);
      }
    } catch {
      // a corrupt stamp only loses the report
    }
  }

  private socketService(): SocketService | undefined {
    try {
      return container.resolve<SocketService>('socketService');
    } catch {
      return undefined;
    }
  }

  private serverNamespace(): ServerNamespace | undefined {
    return this.socketService()?.namespaces.get('/server') as ServerNamespace | undefined;
  }

  private workerManager(): WorkerManager | undefined {
    try {
      return container.resolve<WorkerManager>('workerManager');
    } catch {
      return undefined;
    }
  }

  private workerBehindTarget(workerVersion: string | undefined, targetVersion: string, versionMismatch: boolean): boolean {
    if (!workerVersion || !valid(workerVersion) || !valid(targetVersion)) return versionMismatch;
    return lt(workerVersion, targetVersion);
  }
}
