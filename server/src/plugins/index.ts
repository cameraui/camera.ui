import { API_EVENT, PluginRole, validateContractConsistency } from '@camera.ui/sdk';
import { outputFile, pathExists, readJson, remove } from 'fs-extra/esm';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import semver from 'semver';
import { container } from 'tsyringe';

import { PluginsService } from '../api/services/plugins.service.js';
import { ELECTRON_ASAR_UNPACKED } from '../services/config/constants.js';
import { sendIPCMessage } from '../utils/ipc.js';
import { DEFAULT_PY_VERSION, PythonInstaller } from '../utils/pythonInstaller.js';
import { checkBundledPlugin, extractBundledPlugin } from './bundle.js';
import { PluginHealthMonitor } from './healthMonitor.js';
import { Plugin } from './plugin.js';
import { PLUGIN_IDENTIFIER_PATTERN } from './types.js';

import type { PluginContract } from '@camera.ui/sdk';
import type { CameraUiAPI } from '../api.js';
import type { BackupInfo, IPackageJson } from '../api/types/index.js';
import type { ConfigService } from '../services/config/index.js';
import type { LoggerService } from '../services/logger/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const KEEP_MARKER = '.cameraui-keep';

export class PluginManager {
  public installedPythonVersions = new Set<string>();
  public searchPaths = new Set<string>();

  public plugins = new Map<string, Plugin>();
  public pluginIdentifiers = new Set<string>();

  private logger: LoggerService;
  private api: CameraUiAPI;
  private configService: ConfigService;

  private _pluginsService?: PluginsService;
  private healthMonitor: PluginHealthMonitor;

  constructor() {
    container.registerInstance('pluginManager', this);

    this.api = container.resolve<CameraUiAPI>('api');
    this.logger = container.resolve<LoggerService>('logger');
    this.configService = container.resolve<ConfigService>('configService');

    this.healthMonitor = new PluginHealthMonitor();

    this.api.setMaxListeners(this.api.getMaxListeners() + 1);
    this.api.once(API_EVENT.SHUTDOWN, () => {
      this.plugins.forEach((plugin) => {
        plugin.worker.teardown().catch(() => {});
      });
    });
  }

  public static isQualifiedPluginIdentifier(pluginName: string): boolean {
    const normalizedName = pluginName.replace(/\\/g, '/');
    return PLUGIN_IDENTIFIER_PATTERN.test(normalizedName);
  }

  public static isQualifiedPluginContract(contract?: Partial<PluginContract>): boolean {
    if (!contract?.role) {
      return false;
    }

    return Object.values(PluginRole).includes(contract.role);
  }

  public static extractPluginScope(pluginName: string): string | undefined {
    return pluginName.match(PLUGIN_IDENTIFIER_PATTERN)![2];
  }

  public static extractPluginName(pluginName: string): string {
    return pluginName.match(PLUGIN_IDENTIFIER_PATTERN)![3];
  }

  public static transformDisplaName(pluginName: string): string {
    const extractedPkgName = this.extractPluginName(pluginName).replace('camera-ui-', '').replaceAll('-', ' ');

    return extractedPkgName
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  public static async loadContractFile(installPath: string): Promise<PluginContract | null> {
    const possiblePaths = [join(installPath, 'contract.cjs'), join(installPath, 'bundle', 'contract.cjs')];

    for (const contractPath of possiblePaths) {
      if (!existsSync(contractPath)) {
        continue;
      }

      try {
        const fileUrl = pathToFileURL(contractPath).href;
        const module = await import(fileUrl);
        const contract = module.contract ?? module.default;

        if (contract && PluginManager.isQualifiedPluginContract(contract)) {
          return contract as PluginContract;
        }
      } catch {
        // Invalid contract file, try next location
      }
    }

    return null;
  }

  public static loadPackageJSON(installPath: string): IPackageJson {
    const packageJsonPath = join(installPath, 'package.json');
    let packageJson;

    if (!existsSync(packageJsonPath)) {
      throw new Error(`Plugin ${installPath} does not contain a package.json.`);
    }

    try {
      packageJson = JSON.parse(readFileSync(packageJsonPath, { encoding: 'utf8' }));
    } catch (error: any) {
      throw new Error(`Plugin ${installPath} contains an invalid package.json. Error: ${error}`);
    }

    if (!PluginManager.isQualifiedPluginIdentifier(packageJson.name)) {
      throw new Error(`Plugin "${packageJson.name}" does not have a package name that begins with 'camera-ui-' or '@scope/camera-ui-.`);
    }

    if (!packageJson.keywords?.includes('camera-ui-plugin')) {
      throw new Error(`Plugin "${packageJson.name}" does not contain the keyword 'camera-ui-plugin'.`);
    }

    return packageJson;
  }

  public static async parseContractAsync(installPath: string, pjson: IPackageJson): Promise<PluginContract> {
    const contractFile = await PluginManager.loadContractFile(installPath);

    if (contractFile) {
      return PluginManager.normalizeContract(contractFile, pjson.name);
    }

    throw new Error(`Plugin "${pjson.name}" does not contain a valid contract.cjs file.`);
  }

  public static normalizeContract(contract: PluginContract, pluginName?: string): PluginContract {
    validateContractConsistency(contract, pluginName);

    if (contract.pythonVersion) {
      const validPythonVersions = PythonInstaller.versions;
      const minValidPythonVersion = validPythonVersions[validPythonVersions.length - 1];
      const maxValidPythonVersion = validPythonVersions[0];
      const pluginPythonVersion = semver.clean(contract.pythonVersion);

      if (!pluginPythonVersion || !semver.satisfies(pluginPythonVersion, `>=${minValidPythonVersion} <=${maxValidPythonVersion}`)) {
        contract.pythonVersion = DEFAULT_PY_VERSION;
      }
    }

    if (contract.dependencies) {
      contract.dependencies = contract.dependencies.filter((dep) => PluginManager.isQualifiedPluginIdentifier(dep));
      contract.dependencies = Array.from(new Set(contract.dependencies));
    }

    return {
      role: contract.role,
      provides: contract.provides ?? [],
      consumes: contract.consumes ?? [],
      interfaces: contract.interfaces ?? [],
      capabilities: contract.capabilities ?? [],
      name: contract.name,
      pythonVersion: contract.pythonVersion,
      dependencies: contract.dependencies ?? [],
    };
  }

  public static async checkBundeledPlugin(packageDir: string): Promise<string | undefined> {
    return checkBundledPlugin(packageDir);
  }

  public static async extrackBundeledPlugin(packageDir: string, bundlePath?: string): Promise<void> {
    return extractBundledPlugin(packageDir, bundlePath);
  }

  public async initializeInstalledPlugins(): Promise<void> {
    if (this.plugins.size === 0) {
      this.logger.warn('No plugins found. See the README for information on installing plugins.');
      return;
    }

    await Promise.all(Array.from(this.plugins).map(([, plugin]) => this.initializeInstalledPlugin(plugin)));
  }

  public async initializeInstalledPlugin(plugin: Plugin): Promise<void> {
    if (plugin.disabled) {
      this.logger.warn(`Disabled plugin: ${plugin.displayName} (${plugin.pluginName}@${plugin.info.installedVersion})`);
    } else {
      this.logger.log(`Initializing plugin: ${plugin.displayName} (${plugin.pluginName}@${plugin.info.installedVersion})`);
    }

    try {
      await this.startPluginChild(plugin.pluginName);
    } catch (error: any) {
      this.logger.error(`Error loading plugin: ${plugin.pluginName}:`, error);
      this.plugins.delete(plugin.pluginName);
    }
  }

  public async loadPlugin(absolutePath: string, oldId?: string): Promise<Plugin> {
    const packageJson = PluginManager.loadPackageJSON(absolutePath);
    const pluginName = packageJson.name;
    const scope = PluginManager.extractPluginScope(pluginName);
    const alreadyInstalled = this.plugins.get(pluginName);

    if (alreadyInstalled) {
      throw new Error(`Warning: skipping plugin found at '${absolutePath}' since we already loaded the same plugin from '${alreadyInstalled.installPath}'.`);
    }

    const contract = await PluginManager.parseContractAsync(absolutePath, packageJson);
    const dbPlugin = await this.pluginsService.insertPluginDb(pluginName, oldId);
    const plugin = new Plugin(pluginName, absolutePath, packageJson, dbPlugin._id, contract, scope);

    const bundlePath = await PluginManager.checkBundeledPlugin(plugin.installPath);
    if (bundlePath) {
      this.logger.debug(`Extracting bundled plugin: ${pluginName}`);
      await PluginManager.extrackBundeledPlugin(plugin.installPath, bundlePath);

      const bundlePackageJsonPath = join(plugin.installPath, 'bundle', 'package.json');
      if (await pathExists(bundlePackageJsonPath)) {
        const bundlePackageJson = await readJson(bundlePackageJsonPath);
        plugin.updateMainFromBundle(bundlePackageJson);
      }
    }

    this.plugins.set(pluginName, plugin);

    return plugin;
  }

  public async removePlugin(plugin: Plugin, removeStorage?: boolean): Promise<void> {
    await plugin.worker.cleanup();

    await this.pluginsService.removePluginDbById(plugin.id);

    if (removeStorage) {
      const fullyRemoved = await this.removeSparingKeptDirs(plugin.storagePath);
      if (!fullyRemoved) {
        this.logger.log(`Kept parts of the ${plugin.pluginName} storage (${KEEP_MARKER} marker present)`);
      }
    }

    this.plugins.delete(plugin.pluginName);
  }

  public async startPluginChild(pluginName: string): Promise<void> {
    try {
      const plugin = this.plugins.get(pluginName);

      if (!plugin || plugin.disabled || plugin.worker?.isRunning()) {
        return;
      }

      await plugin.load();

      for (const depName of plugin.contract.dependencies ?? []) {
        if (!PluginManager.isQualifiedPluginIdentifier(depName)) {
          continue;
        }

        const depPlugin = this.plugins.get(depName);

        if (!depPlugin) {
          this.logger.attention(`Plugin ${pluginName} requires ${depName} which is not installed!`);
        }

        if (depPlugin?.disabled) {
          this.logger.attention(`Reactivation and start of dependency ${depPlugin.displayName} for ${plugin.displayName}`);
          depPlugin.disabled = false;
          this.startPluginChild(depName);
        }
      }

      await plugin.worker.start();
    } catch (error: any) {
      this.logger.error(`Error starting plugin ${pluginName}:`, error);
    }
  }

  public async stopPluginChild(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    await plugin?.worker.teardown();
  }

  public async initializePlugins(): Promise<void> {
    sendIPCMessage({
      type: 'START_OUTPUT',
      message: 'Loading plugins...',
    });

    await this.loadInstalledPlugins();
    await this.removeOrphanedPlugins();

    for (const [, plugin] of this.plugins) {
      if (this.configService.config.plugins.disabledPlugins.includes(plugin.pluginName)) {
        plugin.disabled = true;
      }
    }

    await this.handleDisabledPlugins();

    sendIPCMessage({
      type: 'START_OUTPUT',
      message: 'Restoring plugins...',
    });

    await this.restorePlugins();
    await this.installDefaultPlugins();

    sendIPCMessage({
      type: 'START_OUTPUT',
      message: 'Installing dependencies...',
    });

    await this.installRequiredPythonEnvs();
  }

  // Lazy: PluginsService depends on SocketService (registered later in boot).
  // Eager construction here would crash during bootstrap.
  private get pluginsService(): PluginsService {
    return (this._pluginsService ??= new PluginsService());
  }

  private async installRequiredPythonEnvs(): Promise<void> {
    this.installedPythonVersions.clear();

    const pythonVersionsToInstall = new Set<string>();
    pythonVersionsToInstall.add(DEFAULT_PY_VERSION);

    for (const [, plugin] of this.plugins) {
      if (plugin.isPython && !plugin.disabled) {
        pythonVersionsToInstall.add(plugin.contract.pythonVersion ?? DEFAULT_PY_VERSION);
      }
    }

    if (pythonVersionsToInstall.size > 0) {
      const promises: Promise<any>[] = [];

      for (const version of pythonVersionsToInstall) {
        const requirementsPath = resolve(join(__dirname, '..', '..', 'requirements.txt')).replace('app.asar', ELECTRON_ASAR_UNPACKED);
        const py = new PythonInstaller(this.configService.HOME_PATH, this.logger, undefined, version);

        promises.push(
          py
            .install('server', requirementsPath)
            .then(() => this.installedPythonVersions.add(version))
            .catch((error) => this.logger.error(`Error installing Python ${version}:`, error)),
        );
      }

      const { logger } = new PythonInstaller(this.configService.HOME_PATH, this.logger, undefined, DEFAULT_PY_VERSION);

      if (promises.length > 0) {
        logger.log(`Installing required Python versions: ${Array.from(pythonVersionsToInstall).join(', ')} ...`);
        await Promise.all(promises);
        logger.log('Python installation complete.');
      } else if (pythonVersionsToInstall.size > 0) {
        logger.log(`Python versions already installed: ${Array.from(pythonVersionsToInstall).join(', ')}`);
      }

      sendIPCMessage({
        type: 'START_OUTPUT',
        message: 'Dependency installation complete.',
      });
    }
  }

  private async loadInstalledPlugins(): Promise<void> {
    const searchPath = this.configService.PLUGINS_INSTALL_PATH;

    const relativeinstallPaths = readdirSync(searchPath).filter((relativePath) => {
      try {
        return statSync(join(searchPath, relativePath)).isDirectory();
      } catch (error: any) {
        this.logger.debug(`Ignoring path ${resolve(searchPath, relativePath)}`, error);
        return false;
      }
    });

    for (const scopeDirectory of [...relativeinstallPaths].filter((path) => path.startsWith('@'))) {
      const index = relativeinstallPaths.indexOf(scopeDirectory);
      relativeinstallPaths.splice(index, 1);
      const absolutePath = resolve(searchPath, scopeDirectory);

      for (const name of readdirSync(absolutePath)
        .filter((name) => PluginManager.isQualifiedPluginIdentifier(name))
        .filter((name) => {
          try {
            return statSync(join(absolutePath, name)).isDirectory();
          } catch (error: any) {
            this.logger.debug(`Ignoring path ${resolve(absolutePath, name)} - ${error.message}`);
            return false;
          }
        }))
        relativeinstallPaths.push(join(scopeDirectory, name));
    }

    relativeinstallPaths.forEach((pluginIdentifier) => {
      if (PluginManager.isQualifiedPluginIdentifier(pluginIdentifier)) {
        this.pluginIdentifiers.add(pluginIdentifier);
      }
    });

    for (const pluginIdentifier of this.pluginIdentifiers) {
      try {
        const absolutePath = join(searchPath, pluginIdentifier);
        await this.loadPlugin(absolutePath);
      } catch (error: any) {
        this.logger.warn(error.message);
        continue;
      }
    }
  }

  private async restorePlugins(): Promise<void> {
    try {
      const backupInfo: BackupInfo = await readJson(this.configService.BACKUP_INFO_FILE);
      const notInstalledPlugins = backupInfo.plugins.filter((plugin) => !this.plugins.has(plugin.name));

      const restorePromises: Promise<void>[] = [];

      if (notInstalledPlugins.length > 0) {
        this.logger.log('Restoring missing plugins...');

        const restore = async () => {
          for (const pluginInfo of notInstalledPlugins) {
            try {
              this.logger.log(`Installing plugin: ${pluginInfo.name}@${pluginInfo.version}`);

              const installPath = await this.pluginsService.manage(pluginInfo.name, 'install', pluginInfo.version);
              const plugin = await this.loadPlugin(installPath, pluginInfo.id);

              if (this.configService.config.plugins.disabledPlugins.includes(plugin.pluginName)) {
                plugin.disabled = true;
              }

              this.logger.log(`Plugin installed: ${plugin.pluginName}.${plugin.displayName} (${plugin.info.installedVersion})`);
            } catch (error: any) {
              this.logger.error(`Error restoring plugin ${pluginInfo.name}:`, error);
            }
          }
        };

        restorePromises.push(restore());

        await Promise.all(restorePromises);

        this.logger.log('Plugins restored');

        await remove(this.configService.BACKUP_INFO_FILE);
      }
    } catch {
      //
    }
  }

  private async installDefaultPlugins(): Promise<void> {
    if (await pathExists(this.configService.DEFAULTS_INSTALLED_FILE)) {
      return;
    }

    const defaultPlugins = this.configService.DEFAULT_PLUGINS;
    let allSucceeded = true;

    if (defaultPlugins.length > 0) {
      sendIPCMessage({
        type: 'START_OUTPUT',
        message: 'Installing default plugins...',
      });

      this.logger.log('Installing default plugins...');

      for (const pluginName of defaultPlugins) {
        try {
          if (this.pluginsService.getPluginByName(pluginName)) {
            continue;
          }

          this.logger.log(`Installing default plugin: ${pluginName}@latest`);

          const installPath = await this.pluginsService.manage(pluginName, 'install', 'latest');
          const plugin = await this.loadPlugin(installPath);

          if (this.configService.config.plugins.disabledPlugins.includes(plugin.pluginName)) {
            plugin.disabled = true;
          }

          this.logger.log(`Default plugin installed: ${plugin.pluginName}.${plugin.displayName} (${plugin.info.installedVersion})`);
        } catch (error: any) {
          allSucceeded = false;
          this.logger.error(`Error installing default plugin ${pluginName}:`, error);
        }
      }
    }

    if (allSucceeded) {
      await outputFile(this.configService.DEFAULTS_INSTALLED_FILE, new Date().toISOString());
    }
  }

  private async removeSparingKeptDirs(dir: string): Promise<boolean> {
    if (!(await pathExists(dir))) {
      return true;
    }
    if (await pathExists(join(dir, KEEP_MARKER))) {
      return false;
    }

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return false;
    }

    let removedAll = true;
    for (const entry of entries) {
      const entryPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!(await this.removeSparingKeptDirs(entryPath))) {
          removedAll = false;
        }
      } else {
        await remove(entryPath);
      }
    }

    if (removedAll) {
      await remove(dir);
    }
    return removedAll;
  }

  private async removeOrphanedPlugins(): Promise<void> {
    await this.pluginsService.removeOrphanPluginsDb();
  }

  private async handleDisabledPlugins(): Promise<void> {
    await this.pluginsService.handleDisabledPlugins();
  }
}
