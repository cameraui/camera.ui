import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { APP_SERVER_NAME, IS_ELECTRON, sleep } from '@camera.ui/common/utils';
import { Severity } from '@camera.ui/sdk';
import { pathExists, readJson, remove, writeJson } from 'fs-extra/esm';
import { coerce, satisfies } from 'semver';

import { inject, tryInject } from '../../container.js';
import { t } from '../../i18n/index.js';
import { SystemNotificationTypeId } from '../../manager/types.js';
import { ConfigService } from '../../services/config/index.js';
import { assertServerUpdateSpace } from '../../utils/disk-space.js';
import { serverTarget } from '../../utils/engines.js';
import { appUpdateState, requestAppUpdateCheck } from '../../utils/ipc.js';
import { connectsAfter, workerBehind } from '../../workers/lifecycle/update.js';
import { PluginsService } from './plugins.service.js';
import { ServerService } from './server.service.js';

import type { LoggerService } from '../../services/logger/index.js';
import type { WorkerProtocolRange } from '../../workers/lifecycle/update.js';
import type { WorkerInfo } from '../../workers/types.js';
import type { WorkerUpdateResult } from '../../workers/updates.js';
import type { EngineIssue } from '../types/index.js';
import type { ServerNamespace } from '../websocket/nsp/server.js';

export type UpdatesItemKind = 'server' | 'plugin' | 'worker';
export type UpdatesItemStatus = 'pending' | 'updating' | 'restarting' | 'success' | 'error';
export type UpdatesBlockedReason = 'desktop' | 'legacy' | 'launcher' | 'offline' | 'node';

export interface UpdatesActivityItem {
  id: string;
  kind: UpdatesItemKind;
  name: string;
  displayName?: string;
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

export interface UpdatesLeftBehindWorker {
  agentId: string;
  name: string;
  version?: string;
  reason: UpdatesBlockedReason | 'pending' | 'failed';
}

export interface UpdatesPendingPlugin {
  pluginName: string;
  displayName: string;
  installedVersion?: string;
  latestVersion?: string;
  updateAvailable: boolean;
}

export interface UpdatesPending {
  server: { installedVersion: string; latestVersion?: string; updateAvailable: boolean; blockedReason?: UpdatesBlockedReason; engineIssue?: EngineIssue };
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

interface ServerTarget {
  version: string;
  workerProtocol?: WorkerProtocolRange;
}

export class UpdatesLockedError extends Error {
  public readonly statusCode = 409;
}

export class WorkersLeftBehindError extends Error {
  public readonly statusCode = 409;
  public readonly target: { version: string; protocolKnown: boolean };

  constructor(
    target: ServerTarget,
    public readonly workers: UpdatesLeftBehindWorker[],
  ) {
    super(leftBehindMessage(target, workers));
    this.target = { version: target.version, protocolKnown: target.workerProtocol !== undefined };
  }
}

const CHECK_TTL_MS = 60_000;
const MANUAL_ITEM_LINGER_MS = 60_000;
const STAMP_FILE = 'updates-run.json';

let instance: UpdatesService | null = null;

export function updatesService(): UpdatesService {
  instance ??= new UpdatesService();
  return instance;
}

function leftBehindMessage(target: ServerTarget, workers: UpdatesLeftBehindWorker[]): string {
  const names = workers.map((worker) => worker.name).join(', ');
  return target.workerProtocol
    ? `${names} would no longer connect to camera.ui ${target.version}. Update them first or confirm the update.`
    : `camera.ui ${target.version} does not say which workers it accepts, ${names} might no longer connect. Update them first or confirm the update.`;
}

function failedNames(items: UpdatesActivityItem[]): string[] {
  return items.filter((item) => item.status === 'error').map((item) => (item.kind === 'server' ? 'camera.ui' : (item.displayName ?? item.name)));
}

function reachableWorker(worker: WorkerInfo): boolean {
  return worker.state === 'online' || worker.state === 'outdated';
}

function workerBlockedReason(worker: WorkerInfo): UpdatesBlockedReason | undefined {
  if (!worker.update) return 'legacy';
  if (worker.update.updatable) return undefined;
  return worker.update.desktop === false ? 'launcher' : 'desktop';
}

export class UpdatesService {
  private logger: LoggerService;
  private configService: ConfigService;

  private run: UpdatesRunState | null = null;
  private lastRun: UpdatesRunState | null = null;
  private manual = new Map<string, UpdatesActivityItem>();
  private manualCleanupTimers = new Map<string, NodeJS.Timeout>();
  private restartFailures: string[] = [];
  private serverInstallActive = false;
  private lastCheckAt = 0;

  constructor() {
    this.logger = inject('logger');
    this.configService = inject('configService');
  }

  public async init(): Promise<void> {
    this.warnBelowMinimumNode();
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
    this.notifyActivity('plugin', `plugin:${pluginName}`, pluginName, phase, detail, this.pluginDisplayName(pluginName));
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
  }

  public noteWorkerUpdateResult(result: WorkerUpdateResult, name: string): void {
    const id = `worker:${result.agentId}`;
    if (!result.ok && !this.runItem(id)) {
      this.notifyFailed([name], id);
    }
    this.notifyActivity('worker', id, name, result.ok ? 'success' : 'error', { error: result.reason });
    if (!this.isRunActive()) {
      this.refreshUpdateStates();
    }
  }

  public reportRestartFailures(): void {
    this.notifyFailed(this.restartFailures, 'restart');
    this.restartFailures = [];
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
      targetServerVersion: this.serverNamespace()?.targetServerVersion() ?? ConfigService.RUNNING_VERSION,
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
      const engineIssue = serverNsp?.getServerEngineIssue();
      pending.server = {
        installedVersion: ConfigService.VERSION,
        latestVersion: updates.server.latestVersion,
        updateAvailable: true,
        blockedReason: engineIssue ? 'node' : undefined,
        engineIssue,
      };
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

    for (const worker of tryInject('workerManager')?.getWorkers() ?? []) {
      if (worker.state === 'released') continue;
      const reachable = reachableWorker(worker);
      if (!reachable && !workerBehind(worker)) continue;

      const entry = { agentId: worker.agentId, name: worker.name, installedVersion: worker.version };
      const blockedReason = reachable ? workerBlockedReason(worker) : 'offline';
      if (!workerBehind(worker)) {
        pending.workers.push({ ...entry, updateAvailable: false, updatable: true });
      } else if (!blockedReason) {
        pending.workers.push({ ...entry, updateAvailable: true, updatable: true });
      } else {
        pending.workers.push({ ...entry, updateAvailable: true, updatable: false, blockedReason });
      }
    }

    return pending;
  }

  public async assertWorkersFollow(spec: string, confirmWorkers: boolean): Promise<void> {
    const target = await this.resolveServerTarget(spec);
    const behind = this.leftBehind(target);
    if (behind.length === 0) return;
    if (!confirmWorkers) {
      throw new WorkersLeftBehindError(target, behind);
    }
    this.logger.warn(`Server update to ${target.version} confirmed, these workers stay behind: ${behind.map((worker) => worker.name).join(', ')}`);
  }

  public async runAll({ confirmWorkers = false }: { confirmWorkers?: boolean } = {}): Promise<UpdatesRunState> {
    this.assertRunAllowed();

    const pending = this.pending();
    const serverPending = pending.server.updateAvailable && !pending.server.blockedReason;
    const workerIds = new Set(pending.workers.filter((worker) => worker.updateAvailable && worker.updatable).map((worker) => `worker:${worker.agentId}`));

    let target: ServerTarget | undefined;
    let behind: UpdatesLeftBehindWorker[] = [];
    if (serverPending) {
      // check before the run stops plugins for a server step that cannot work
      if (!IS_ELECTRON) {
        assertServerUpdateSpace(this.configService.HOME_PATH);
      }
      target = await this.resolveServerTarget(pending.server.latestVersion ?? 'latest');
      behind = this.leftBehind(target).filter((worker) => !workerIds.has(`worker:${worker.agentId}`));
      if (behind.length > 0 && !confirmWorkers) {
        throw new WorkersLeftBehindError(target, behind);
      }
      // another run may have started while the registry answered
      this.assertRunAllowed();
    }

    const items: UpdatesActivityItem[] = [
      ...pending.workers
        .filter((worker) => workerIds.has(`worker:${worker.agentId}`))
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
          displayName: plugin.displayName,
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
    if (behind.length > 0) {
      this.logger.warn(`Update run: confirmed that these workers stay behind: ${behind.map((worker) => worker.name).join(', ')}`);
    }
    this.emitStatus();

    this.executeRun(this.run, pending.targetServerVersion, target, new Set(behind.map((worker) => worker.agentId)));

    return this.run;
  }

  public cancelRun(): void {
    if (!this.isRunActive() || !this.run) return;
    this.run.cancelRequested = true;
    this.emitStatus();
  }

  private async executeRun(run: UpdatesRunState, workerTarget: string, target: ServerTarget | undefined, confirmed: Set<string>): Promise<void> {
    const stopped: string[] = [];
    let blockers: UpdatesLeftBehindWorker[] | undefined;

    for (const item of run.items) {
      if (run.cancelRequested) break;

      try {
        if (item.kind === 'worker') {
          await this.runWorkerItem(item, workerTarget);
        } else {
          // worker items come first, their results are final here
          blockers ??= target ? this.leftBehind(target, run).filter((worker) => !confirmed.has(worker.agentId)) : [];
          if (item.kind === 'plugin') {
            await this.runPluginItem(item, target !== undefined && blockers.length === 0, stopped);
          } else if (blockers.length > 0) {
            item.status = 'error';
            item.error = `Skipped: ${blockers.map((worker) => worker.name).join(', ')} would no longer connect after the update`;
            this.logger.warn(`Update run: server skipped, ${item.error.slice('Skipped: '.length)}`);
          } else {
            await this.runServerItem(item, run);
            return;
          }
        }
      } catch (error: any) {
        item.status = 'error';
        item.error = error?.message ?? String(error);
        this.logger.warn(`Update run: ${item.name} failed: ${item.error}`);
      }
      this.emitStatus();
    }

    this.finishRun();
    this.notifyFailed(failedNames(run.items), run.id);
    await this.startStopped(stopped);
    await this.refreshUpdateStates();
  }

  private async runWorkerItem(item: UpdatesActivityItem, targetVersion: string): Promise<void> {
    const manager = tryInject('workerManager');
    if (!manager) throw new Error('Worker manager not available');

    const agentId = item.id.slice('worker:'.length);
    item.status = 'updating';
    this.emitStatus();

    await manager.updateWorker(agentId, targetVersion);

    const result = await manager.waitWorkerUpdate(agentId);
    if (!result.ok) throw new Error(result.reason);
    item.status = 'success';
    item.installedVersion = result.version;
  }

  private async runPluginItem(item: UpdatesActivityItem, serverAhead: boolean, stopped: string[]): Promise<void> {
    item.status = 'updating';
    this.emitStatus();

    const pluginsService = new PluginsService();
    await pluginsService.assertWorkerCanRun(item.name, item.targetVersion ?? 'latest');
    // with a server update ahead the restart brings the plugins up anyway
    await pluginsService.manage(item.name, 'update', item.targetVersion, undefined, {
      internal: true,
      restart: !serverAhead,
      onLeftStopped: () => stopped.push(item.name),
    });
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
    } catch (error) {
      await this.clearStamp();
      throw error;
    }

    item.status = 'restarting';
    this.finishRun();
    this.logger.log('Update run: server updated, restarting to apply');

    setTimeout(() => inject('cameraui').shutdown('update'), 1_000);
  }

  private assertRunAllowed(): void {
    if (this.isRunActive()) {
      throw new UpdatesLockedError('An update run is already in progress.');
    }
    if (this.serverInstallActive || this.anyManualActive() || this.anyWorkerUpdating()) {
      throw new UpdatesLockedError('Manual updates are running. Wait for them to finish.');
    }
  }

  private async resolveServerTarget(spec: string): Promise<ServerTarget> {
    // the desktop app ships its own server, its version shows only after the update
    if (IS_ELECTRON) {
      return { version: spec };
    }
    return (await serverTarget(spec)) ?? { version: spec };
  }

  private leftBehind(target: ServerTarget, run?: UpdatesRunState): UpdatesLeftBehindWorker[] {
    if (IS_ELECTRON) return [];

    const behind: UpdatesLeftBehindWorker[] = [];
    for (const worker of tryInject('workerManager')?.getWorkers() ?? []) {
      // a disabled worker runs nothing and shows as outdated once enabled again
      if (worker.state === 'released' || connectsAfter(worker, target.version, target.workerProtocol)) continue;

      const failed = run?.items.some((item) => item.id === `worker:${worker.agentId}` && item.status === 'error');
      const reason = failed ? 'failed' : reachableWorker(worker) ? (workerBlockedReason(worker) ?? 'pending') : 'offline';
      behind.push({ agentId: worker.agentId, name: worker.name, version: worker.version, reason });
    }
    return behind;
  }

  private async startStopped(pluginNames: string[]): Promise<void> {
    if (pluginNames.length === 0) return;
    this.logger.log(`Update run: the server did not update, starting the stopped plugins again: ${pluginNames.join(', ')}`);

    const pluginsService = new PluginsService();
    for (const pluginName of pluginNames) {
      await pluginsService.startPlugin(pluginName).catch((error) => this.logger.warn(`Update run: could not start ${pluginName} again: ${error?.message ?? error}`));
    }
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
    displayName?: string,
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
      this.manual.set(id, { id, kind, name, displayName, status: 'updating', source: 'manual', targetVersion: detail?.version });
    } else {
      const item = this.manual.get(id) ?? { id, kind, name, displayName, status: 'updating', source: 'manual' as const };
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

  private notifyFailed(names: string[], tag: string): void {
    if (names.length === 0) return;
    tryInject('proxy')
      ?.notificationManager.notify({
        source: { kind: 'system', id: SystemNotificationTypeId.UpdateFailed },
        notification: {
          title: t('updates.failed_title'),
          body: t('updates.failed_body', { names: names.join(', ') }),
          severity: Severity.Warn,
          tag: `${SystemNotificationTypeId.UpdateFailed}:${tag}`,
          deepLink: '/updates',
          adminOnly: true,
        },
      })
      .catch(() => {});
  }

  private runItem(id: string): UpdatesActivityItem | undefined {
    if (!this.run?.active) return undefined;
    return this.run.items.find((item) => item.id === id);
  }

  private anyManualActive(): boolean {
    return [...this.manual.values()].some((item) => item.status === 'updating' || item.status === 'restarting');
  }

  private anyWorkerUpdating(): boolean {
    return tryInject('workerManager')?.workerUpdatesActive() === true;
  }

  private emitStatus(): void {
    const socketService = tryInject('socketService');
    if (!socketService) return;

    const publicItem = (item: UpdatesActivityItem): { kind: UpdatesItemKind; name: string; displayName?: string; status: UpdatesItemStatus } => ({
      kind: item.kind,
      name: item.name,
      displayName: item.displayName,
      status: item.status,
    });

    const items = [...(this.run?.active ? this.run.items : (this.lastRun?.items ?? [])).map(publicItem), ...[...this.manual.values()].map(publicItem)];

    const updating = items.some((item) => item.status === 'updating' || item.status === 'restarting');

    socketService.io.of('/camera.ui').emit('updates-status', {
      updating,
      runActive: this.run?.active === true,
      items,
    });
  }

  private pluginDisplayName(pluginName: string): string | undefined {
    try {
      return new PluginsService().listPlugins().find((plugin) => plugin.info.pluginName === pluginName)?.info.displayName;
    } catch {
      // a first install is not in the registry yet
      return undefined;
    }
  }

  private async refreshUpdateStates(): Promise<void> {
    const serverNsp = this.serverNamespace();
    if (!serverNsp) return;
    try {
      // forced, the pending count may land on the same number after a run
      await serverNsp.checkPlugins(true);
      await serverNsp.checkServer(true);
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

  private warnBelowMinimumNode(): void {
    if (satisfies(coerce(process.version) ?? process.version, `>=${ConfigService.MIN_NODE_VERSION}`)) return;
    this.logger.warn(
      `camera.ui needs Node.js ${ConfigService.MIN_NODE_VERSION} or newer, this machine runs ${process.version}. Server updates wait until Node.js is updated.`,
    );
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
      // the notifier plugins are not up yet, the master reports these once they are
      this.restartFailures = failedNames(stamp.items);

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

  private serverNamespace(): ServerNamespace | undefined {
    return tryInject('socketService')?.namespaces.get('/server') as ServerNamespace | undefined;
  }
}
