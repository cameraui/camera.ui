import { move, pathExists, readJson, remove } from 'fs-extra/esm';

import { describePlatformRequirement, isPlatformCompatible } from '../../utils/platform.js';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { container, delay, registry } from 'tsyringe';
import { v4 as uuidv4 } from 'uuid';

import { PluginManager } from '../../plugins/index.js';
import { Plugin } from '../../plugins/plugin.js';
import { extractPackage, installDependencies } from '../../utils/npm/index.js';
import { Database } from '../database/index.js';
import { CamerasService } from './cameras.service.js';
import { elidePath, getTerminalCols, InstallLogger } from '../utils/install-logger.js';

import type { Server } from 'socket.io';
import type { PluginWorker } from '../../plugins/worker.js';
import type { ConfigService } from '../../services/config/index.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { DBPlugin } from '../database/types.js';
import type { PluginsProgress } from '../types/index.js';
import type { SocketService } from '../websocket/index.js';

@registry([
  {
    token: 'dbs',
    useValue: delay(() => Database),
  },
  {
    token: 'pluginManager',
    useValue: delay(() => PluginManager),
  },
])
export class PluginsService {
  private dbs: Database;
  private io: Server;
  private logger: LoggerService;
  private pluginManager: PluginManager;
  private configService: ConfigService;
  private socketService: SocketService;

  private managingPluginsMap = new Map<string, PluginsProgress>();

  constructor() {
    this.dbs = container.resolve<Database>('dbs');
    this.logger = container.resolve<LoggerService>('logger');
    this.pluginManager = container.resolve<PluginManager>('pluginManager');
    this.configService = container.resolve<ConfigService>('configService');
    this.socketService = container.resolve<SocketService>('socketService');

    this.io = this.socketService.io;
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
      _id: oldId ?? uuidv4(),
      pluginName,
    };

    await this.dbs.pluginsDB.put(pluginData._id, pluginData);
    return pluginData;
  }

  public async setWorkerAgentId(pluginName: string, agentId: string | undefined): Promise<void> {
    const plugin = this.getPluginDbByName(pluginName);
    if (!plugin) {
      throw new Error(`Plugin ${pluginName} not found`);
    }

    await this.dbs.pluginsDB.put(plugin._id, { ...plugin, workerAgentId: agentId });
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

  public async removeOrphanPluginsDb(): Promise<void> {
    const identifiers = new Set(this.listPluginsIdentifier());
    const orphanedNames: string[] = [];

    for (const { value } of this.dbs.pluginsDB.getRange()) {
      if (!this.getPluginByName(value.pluginName) && !identifiers.has(value.pluginName)) {
        orphanedNames.push(value.pluginName);
      }
    }

    await Promise.all(orphanedNames.map((name) => this.removePluginDbByName(name)));
  }

  public async handleDisabledPlugins(): Promise<void> {
    const camerasService = new CamerasService();
    const plugins = this.listPlugins();
    const disabledPlugins: string[] = plugins.filter((plugin) => plugin.disabled).map((plugin) => plugin.pluginName);

    for (const pluginName of disabledPlugins) {
      await camerasService.removeByPluginName(pluginName);
    }
  }

  public async manage(pluginName: string, action: 'install' | 'update' | 'uninstall', version?: string, pluginId?: string): Promise<string> {
    const targetDir = join(this.configService.PLUGINS_INSTALL_PATH, pluginName);
    const log = this.createLogger(pluginName);

    const title = `${action.charAt(0).toUpperCase()}${action.slice(1)} · ${pluginName}${action !== 'uninstall' && version ? `@${version}` : ''}`;
    log.header(title, { user: userInfo().username, target: elidePath(targetDir) });

    const existingAction = this.managingPluginsMap.get(pluginName);
    if (existingAction) {
      log.error(`Cannot ${action} plugin ${pluginName} while ${existingAction.action} is in progress.`);
      throw new Error(`Cannot ${action} plugin ${pluginName} while ${existingAction.action} is in progress.`);
    }

    this.managingPluginsMap.set(pluginName, { pluginName, action, version: version ?? 'latest' });

    try {
      switch (action) {
        case 'install':
          await this.installPlugin(log, pluginName, version ?? 'latest', targetDir);
          break;
        case 'update':
          await this.updatePlugin(log, pluginName, version ?? 'latest', targetDir);
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
      this.managingPluginsMap.delete(pluginName);
    }

    return targetDir;
  }

  public installingPlugins(): PluginsProgress[] {
    const pluginsInProgress: PluginsProgress[] = [];
    for (const [, progressInfo] of this.managingPluginsMap) {
      pluginsInProgress.push(progressInfo);
    }
    return pluginsInProgress;
  }

  private async installPlugin(log: InstallLogger, pluginName: string, version: string, targetDir: string, update?: boolean): Promise<void> {
    const backupTempDir = join(tmpdir(), `${pluginName}_backup`);
    let backedUp = false;

    try {
      if (await pathExists(targetDir)) {
        log.step('Backing up existing installation');
        await move(targetDir, backupTempDir);
        backedUp = true;
        log.done();
      }

      log.step('Downloading and extracting package');
      await extractPackage(`${pluginName}@${version}`, targetDir);
      log.done();

      // Skip dependency install when the plugin can't run on this host anyway
      // (native builds for a foreign platform would fail) — a compatible
      // worker installs its own copy including dependencies.
      const pjson = await readJson(join(targetDir, 'package.json')).catch(() => null);
      if (pjson && !isPlatformCompatible(pjson.os, pjson.cpu)) {
        const requirement = describePlatformRequirement(pjson.os, pjson.cpu);
        log.step(`Skipping dependencies — plugin requires ${requirement}, this host is ${process.platform}/${process.arch} (worker-only plugin)`);
        log.done();
      } else {
        log.block('Installing dependencies');
        await installDependencies(targetDir, this.configService.config.plugins.allowBuildScripts ?? false, (chunk) => log.feed(chunk));
        log.flush();
      }

      await this.extrackBundeledPlugin(log, targetDir);

      log.step('Cleaning up');
      await remove(backupTempDir);
      log.done();

      log.success(`${pluginName}@${version} ${update ? 'updated' : 'installed'} — restart to apply`);
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

  private async updatePlugin(log: InstallLogger, pluginName: string, version: string, targetDir: string): Promise<void> {
    try {
      log.step('Preparing update');

      const packageJsonPath = join(targetDir, 'package.json');
      const packageJson = await readJson(packageJsonPath);
      const currentVersion = packageJson.version;

      if (currentVersion === version) {
        log.done('up to date');
        log.success(`${pluginName}@${version} is already up to date`);
        return;
      }

      log.done();
    } catch (error: any) {
      log.error(`Could not read current version of ${pluginName}: ${error.message}`);
      throw error;
    }

    // installPlugin handles its own error/restore output, so it stays outside the try above.
    await this.installPlugin(log, pluginName, version, targetDir, true);
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
      (message) => this.io.of('/logs').emit(`stdout/${pluginName}`, message),
      () => getTerminalCols(pluginName),
    );
  }
}
