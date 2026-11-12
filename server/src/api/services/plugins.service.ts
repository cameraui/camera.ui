import { move, pathExists, readJson, readJsonSync, remove } from 'fs-extra/esm';

import { sleep, uuidv4 } from '@camera.ui/common/utils';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';

import { inject, tryInject } from '../../container.js';
import { PluginManager } from '../../plugins/index.js';
import { pythonEnvEntries, writeInstallMarker } from '../../plugins/install-state.js';
import { extractPackage, getFullManifest, installDependencies } from '../../utils/npm/index.js';
import { describeHost, describePlatformRequirement, isPlatformCompatible, platformRequirement } from '../../utils/platform.js';
import { elidePath, getTerminalCols, InstallLogger } from '../utils/install-logger.js';
import { CamerasService } from './cameras.service.js';
import { updatesService } from './updates.service.js';

import type { Plugin } from '../../plugins/plugin.js';
import type { PluginWorker } from '../../plugins/worker.js';
import type { ConfigService } from '../../services/config/index.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { Database } from '../database/index.js';
import type { DBPlugin } from '../database/types.js';
import type { BackupInfo, PluginsProgress } from '../types/index.js';

const MANAGE_CONCURRENCY = 2;
const manageQueue: PluginsProgress[] = [];
const manageWaiters: (() => void)[] = [];
let manageRunning = 0;

function acquireManageSlot(): Promise<void> {
  if (manageRunning < MANAGE_CONCURRENCY) {
    manageRunning++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    manageWaiters.push(() => {
      manageRunning++;
      resolve();
    });
  });
}

function releaseManageSlot(): void {
  manageRunning--;
  manageWaiters.shift()?.();
}

export class PluginsService {
  private dbs: Database;
  private logger: LoggerService;
  private pluginManager: PluginManager;
  private configService: ConfigService;

  constructor() {
    this.dbs = inject('dbs');
    this.logger = inject('logger');
    this.pluginManager = inject('pluginManager');
    this.configService = inject('configService');
  }

  public listPlugins(): Plugin[] {
    return Array.from(this.pluginManager.plugins).map(([, plugin]) => plugin);
  }

  public listPluginProcesses(): PluginWorker[] {
    return Array.from(this.pluginManager.plugins).map(([, plugin]) => plugin.worker);
  }

  public listPluginsIdentifier(): string[] {
    return Array.from(this.pluginManager.pluginIdentifiers);
  }

  public getPluginByName(pluginName: string): Plugin | undefined {
    const installedPlugins = this.listPlugins();
    const plugin = installedPlugins.find((plugin) => plugin.pluginName === pluginName);
    return plugin;
  }

  public getPluginById(id: string): Plugin | undefined {
    const installedPlugins = this.listPlugins();
    const plugin = installedPlugins.find((plugin) => plugin.id === id);
    return plugin;
  }

  public getPluginProcessByName(pluginName: string): PluginWorker | undefined {
    const installedPluginsProcesses = this.listPluginProcesses();
    const plugin = installedPluginsProcesses.find((pluginProcess) => pluginProcess.plugin.pluginName === pluginName);
    return plugin;
  }

  public getPluginProcessById(id: string): PluginWorker | undefined {
    const installedPluginsProcesses = this.listPluginProcesses();
    const plugin = installedPluginsProcesses.find((pluginProcess) => pluginProcess.plugin.id === id);
    return plugin;
  }

  public listPluginDb(): DBPlugin[] {
    return [...this.dbs.pluginsDB.getRange()].map(({ value }) => value);
  }

  public getPluginDbByName(pluginName: string): DBPlugin | undefined {
    for (const { value } of this.dbs.pluginsDB.getRange()) {
      if (value.pluginName === pluginName) return value;
    }
    return undefined;
  }

  public getPluginDbById(id: string): DBPlugin | undefined {
    return this.dbs.pluginsDB.get(id);
  }

  public async insertPluginDb(pluginName: string, oldId?: string): Promise<DBPlugin> {
    const existing = this.getPluginDbByName(pluginName);
    if (existing) return existing;

    const pluginData: DBPlugin = {
      _id: oldId ?? this.formerPluginId(pluginName) ?? uuidv4(),
      pluginName,
    };

    await this.dbs.pluginsDB.put(pluginData._id, pluginData);
    return pluginData;
  }

  public async setWorkerAgentId(pluginName: string, agentId: string | undefined, workerOnly?: boolean): Promise<void> {
    const plugin = this.getPluginDbByName(pluginName);
    if (!plugin) {
      throw new Error(`Plugin ${pluginName} not found`);
    }

    await this.dbs.commit(this.dbs.pluginsDB, plugin._id, (current) =>
      current ? { ...current, workerAgentId: agentId, workerOnly: agentId && (workerOnly ?? current.workerOnly) ? true : undefined } : undefined,
    );
  }

  public listByAgentId(agentId: string): DBPlugin[] {
    return this.listPluginDb().filter((plugin) => plugin.workerAgentId === agentId);
  }

  public async removePluginDbByName(pluginName: string): Promise<void> {
    const plugin = this.getPluginDbByName(pluginName);
    if (!plugin) return;

    const camerasService = new CamerasService();
    await camerasService.removeByPluginName(pluginName);

    await this.dbs.pluginsDB.remove(plugin._id);
  }

  public async removePluginDbById(id: string): Promise<void> {
    if (!this.getPluginDbById(id)) return;

    const camerasService = new CamerasService();
    await camerasService.removeByPluginId(id);

    await this.dbs.pluginsDB.remove(id);
  }

  public async removeAllPluginsDb(): Promise<void> {
    const plugins = this.listPluginDb();
    const camerasService = new CamerasService();

    for (const plugin of plugins) {
      await camerasService.removeByPluginName(plugin.pluginName);
    }

    await this.dbs.pluginsDB.clearAsync();
  }

  public listPendingRestorePlugins(): Set<string> {
    try {
      const info: BackupInfo = readJsonSync(this.configService.BACKUP_INFO_FILE);
      return new Set(info.plugins.map((plugin) => plugin.name));
    } catch {
      return new Set();
    }
  }

  public async removeOrphanPluginsDb(): Promise<void> {
    const identifiers = new Set(this.listPluginsIdentifier());
    const pending = this.listPendingRestorePlugins();
    const orphanedNames: string[] = [];

    for (const { value } of this.dbs.pluginsDB.getRange()) {
      if (!this.getPluginByName(value.pluginName) && !identifiers.has(value.pluginName) && !pending.has(value.pluginName)) {
        orphanedNames.push(value.pluginName);
      }
    }

    await Promise.all(orphanedNames.map((name) => this.removePluginDbByName(name)));
  }

  public async manage(
    pluginName: string,
    action: 'install' | 'update' | 'uninstall',
    version?: string,
    pluginId?: string,
    opts: { internal?: boolean; restart?: boolean; onLeftStopped?: () => void } = {},
  ): Promise<string> {
    if (!opts.internal) {
      updatesService().assertManualAllowed('plugin');
    }

    const targetDir = join(this.configService.PLUGINS_INSTALL_PATH, pluginName);
    const log = this.createLogger(pluginName);

    const title = `${action.charAt(0).toUpperCase()}${action.slice(1)} · ${pluginName}${action !== 'uninstall' && version ? `@${version}` : ''}`;
    log.header(title, { user: userInfo().username, target: elidePath(targetDir) });

    const existingAction = manageQueue.find((entry) => entry.pluginName === pluginName);
    if (existingAction) {
      log.error(`Cannot ${action} plugin ${pluginName} while ${existingAction.action} is ${existingAction.status}.`);
      throw new Error(`Cannot ${action} plugin ${pluginName} while ${existingAction.action} is ${existingAction.status}.`);
    }

    const entry: PluginsProgress = { pluginName, action, version: version ?? 'latest', status: 'queued' };
    manageQueue.push(entry);
    this.emitManageQueue();

    const source = opts.internal ? 'run' : 'manual';
    if (action !== 'uninstall') {
      updatesService().notifyPluginManage(pluginName, 'start', { version, source });
    }

    try {
      const mustWait = manageRunning >= MANAGE_CONCURRENCY;
      if (mustWait) log.step('Waiting for other plugin operations');
      await acquireManageSlot();
      if (mustWait) log.done();

      entry.status = 'running';
      this.emitManageQueue();

      try {
        const result = await this.runManage(log, entry, targetDir, pluginId, opts);
        if (action !== 'uninstall') {
          updatesService().notifyPluginManage(pluginName, 'success', { version, source });
        }
        return result;
      } catch (error: any) {
        if (action !== 'uninstall') {
          updatesService().notifyPluginManage(pluginName, 'error', { version, error: error?.message ?? String(error), source });
        }
        throw error;
      } finally {
        releaseManageSlot();
      }
    } finally {
      const index = manageQueue.indexOf(entry);
      if (index !== -1) manageQueue.splice(index, 1);
      this.emitManageQueue();
    }
  }

  public async startPlugin(pluginName: string): Promise<void> {
    await this.pluginManager.startPluginChild(pluginName);
  }

  public async assertWorkerCanRun(pluginName: string, version: string): Promise<void> {
    const agentId = this.getPluginDbByName(pluginName)?.workerAgentId;
    const workerManager = tryInject('workerManager');
    if (!agentId || !workerManager) {
      return;
    }
    const manifest = await getFullManifest(`${pluginName}@${version}`).catch(() => undefined);
    const issue = workerManager.pluginApiIssue(agentId, manifest?.cameraui?.protocolLevel);
    if (issue) {
      throw Object.assign(new Error(issue), { statusCode: 409 });
    }
  }

  public installingPlugins(): PluginsProgress[] {
    return [...manageQueue];
  }

  private formerPluginId(pluginName: string): string | undefined {
    const id = new CamerasService().formerPluginId(pluginName);
    return id && !this.getPluginDbById(id) ? id : undefined;
  }

  private async runManage(
    log: InstallLogger,
    entry: PluginsProgress,
    targetDir: string,
    pluginId?: string,
    opts: { restart?: boolean; onLeftStopped?: () => void } = {},
  ): Promise<string> {
    const { pluginName, action, version } = entry;

    const worker = this.getPluginProcessByName(pluginName);
    const wasRunning = worker?.isRunning() === true || worker?.isRemoteWorker === true;
    // a worker keeps running the old version until the new one is installed beside it
    const onWorker = action === 'update' && opts.restart !== false && worker?.isRemoteWorker === true && worker.isRunning();
    let installedNew = false;

    try {
      // a process stuck in STARTING holds file locks that break the backup rename on windows
      if (worker && !onWorker && (wasRunning || worker.getPID() > 0)) {
        log.step('Stopping running plugin');
        await worker.teardown();
        log.done();
      }

      switch (action) {
        case 'install':
          await this.installPlugin(log, pluginName, version, targetDir);
          installedNew = true;
          break;
        case 'update':
          installedNew = await this.updatePlugin(log, pluginName, version, targetDir);
          break;
        case 'uninstall':
          await this.uninstallPlugin(log, pluginName, targetDir);

          if (pluginId) {
            const camerasService = new CamerasService();
            await camerasService.removeByPluginId(pluginId);
          }
          break;
      }
    } finally {
      if (action !== 'uninstall' && (await pathExists(targetDir))) {
        await this.getPluginByName(pluginName)
          ?.reparsePackageJson()
          .catch(() => {});

        if (onWorker) {
          if (installedNew && worker) {
            await this.switchOnWorker(log, worker, pluginName);
          }
        } else if (wasRunning && opts.restart !== false) {
          log.step('Starting plugin');
          await this.pluginManager.startPluginChild(pluginName);
          log.done();
        } else if (wasRunning) {
          opts.onLeftStopped?.();
        }
      }
    }

    if (installedNew) {
      log.success(`${pluginName}@${version} ${action === 'update' ? 'updated' : 'installed'}`);
    }

    return targetDir;
  }

  private async switchOnWorker(log: InstallLogger, worker: PluginWorker, pluginName: string): Promise<void> {
    const plugin = this.getPluginByName(pluginName);
    const version = plugin?.info.installedVersion;
    const manager = tryInject('workerManager');
    if (!plugin || !version || !manager) {
      await worker.restart();
      return;
    }

    const artifact = plugin.artifact?.version === version ? plugin.artifact : undefined;
    log.step('Installing on its worker beside the running version');
    await manager.preparePlugin(pluginName, { version, integrity: artifact?.integrity, tarball: artifact?.tarball });
    log.done();

    log.step('Switching to the new version on its worker');
    await worker.restart();
    const reason = await manager.waitPluginVersion(pluginName, version);
    if (reason) {
      log.error(`Its worker could not start ${pluginName}@${version}: ${reason}`);
      throw new Error(`Its worker could not start ${pluginName}@${version}: ${reason}`);
    }
    log.done();
  }

  private emitManageQueue(): void {
    inject('socketService').io.of('/plugins').emit('manage-queue', this.installingPlugins());
  }

  private async installPlugin(log: InstallLogger, pluginName: string, version: string, targetDir: string, update?: boolean): Promise<void> {
    const backupTempDir = join(tmpdir(), `${pluginName}_backup`);
    let backedUp = false;

    try {
      if (await pathExists(targetDir)) {
        log.step('Backing up existing installation');
        try {
          await move(targetDir, backupTempDir);
        } catch (error: any) {
          if (error.code !== 'EPERM' && error.code !== 'EBUSY') {
            throw error;
          }
          // windows releases file handles of a just-killed process with a delay
          await sleep(2000);
          await move(targetDir, backupTempDir).catch((retryError: any) => {
            retryError.message = `${retryError.message} (plugin files are locked, is a plugin process still running?)`;
            throw retryError;
          });
        }
        backedUp = true;
        log.done();
      }

      log.step('Downloading and extracting package');
      const manifest = await extractPackage(`${pluginName}@${version}`, targetDir);
      log.done();

      const pjson = await readJson(join(targetDir, 'package.json')).catch(() => null);
      if (pjson && !isPlatformCompatible(platformRequirement(pjson))) {
        const requirement = describePlatformRequirement(platformRequirement(pjson));
        log.step(`Skipping dependencies: plugin requires ${requirement}, this host is ${describeHost()} (worker-only plugin)`);
        log.done();
      } else {
        log.block('Installing dependencies');
        await installDependencies(targetDir, this.configService.config.plugins.allowBuildScripts ?? false, (chunk) => log.feed(chunk), {
          add: (proc) => this.configService.addProcess(proc),
          remove: (pid) => this.configService.removeProcessByPID(pid),
        });
        log.flush();
      }

      await this.extrackBundeledPlugin(log, targetDir);

      if (update && backedUp) {
        await this.keepPythonEnv(log, backupTempDir, targetDir);
      }
      // workers install the same build
      await writeInstallMarker(targetDir, { version: manifest.version, integrity: manifest.dist.integrity, tarball: manifest.dist.tarball });

      log.step('Cleaning up');
      await remove(backupTempDir);
      log.done();
    } catch (error: any) {
      log.error(`${update ? 'Update' : 'Installation'} of ${pluginName}@${version} failed: ${error.message}`);

      if (backedUp) {
        try {
          log.step('Restoring previous version');
          await remove(targetDir);
          await move(backupTempDir, targetDir);
          log.done('restored');
        } catch (restoreError: any) {
          log.error(`Failed to restore previous version: ${restoreError.message}`);
        }
      }

      throw error;
    }
  }

  private async updatePlugin(log: InstallLogger, pluginName: string, version: string, targetDir: string): Promise<boolean> {
    try {
      log.step('Preparing update');

      const packageJsonPath = join(targetDir, 'package.json');
      const packageJson = await readJson(packageJsonPath);
      const currentVersion = packageJson.version;

      if (currentVersion === version) {
        log.done('up to date');
        log.success(`${pluginName}@${version} is already up to date`);
        return false;
      }

      log.done();
    } catch (error: any) {
      log.error(`Could not read current version of ${pluginName}: ${error.message}`);
      throw error;
    }

    // outside the try, installPlugin reports its own errors and restores
    await this.installPlugin(log, pluginName, version, targetDir, true);
    return true;
  }

  private async keepPythonEnv(log: InstallLogger, backupTempDir: string, targetDir: string): Promise<void> {
    const kept = await pythonEnvEntries(backupTempDir);
    if (!kept.length) {
      return;
    }

    log.step('Keeping Python environment');

    for (const name of kept) {
      await move(join(backupTempDir, name), join(targetDir, name), { overwrite: true });
    }

    log.done();
  }

  private async uninstallPlugin(log: InstallLogger, pluginName: string, targetDir: string): Promise<void> {
    try {
      log.step('Removing plugin');
      await remove(targetDir);
      log.done();

      log.success(`${pluginName} uninstalled`);
    } catch (error: any) {
      log.error(`Uninstallation of ${pluginName} failed: ${error.message}`);
      throw error;
    }
  }

  private async extrackBundeledPlugin(log: InstallLogger, packageDir: string): Promise<void> {
    log.step('Checking for bundled plugin');

    const bundlePath = await PluginManager.checkBundeledPlugin(packageDir);
    if (!bundlePath) {
      log.done('none');
      return;
    }

    log.done('found');

    log.step('Extracting bundled plugin');
    await PluginManager.extrackBundeledPlugin(packageDir, bundlePath);
    log.done();
  }

  private createLogger(pluginName: string): InstallLogger {
    return new InstallLogger(
      (message) => inject('socketService').io.of('/logs').emit(`stdout/${pluginName}`, message),
      () => getTerminalCols(pluginName),
    );
  }
}
