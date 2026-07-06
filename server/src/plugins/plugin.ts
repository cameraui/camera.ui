import { lstatSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { container } from 'tsyringe';

import { ConfigService } from '../services/config/index.js';
import { checkEngineCompatibility } from '../utils/engines.js';
import { isPlatformCompatible } from '../utils/platform.js';
import { PluginManager } from './index.js';
import { resolvePluginMain } from './main-file.js';
import { PluginWorker } from './worker.js';

import type { PluginContract } from '@camera.ui/sdk';
import type { CameraUiPlugin, IPackageJson } from '../api/types/index.js';
import type { LoggerService } from '../services/logger/index.js';
import type { Context } from './types.js';

export class Plugin {
  readonly id: string;
  public main: string;
  readonly displayName: string;
  public isPython: boolean;
  public isGo: boolean;
  readonly isSymLink: boolean;
  readonly installPath: string;
  public mainPath: string;
  readonly storagePath: string;
  readonly logPath: string;
  readonly worker: PluginWorker;
  public runningVersion?: string;

  private logger: LoggerService;
  private configService: ConfigService;

  private _disabled = false;
  private _info: CameraUiPlugin;
  private _contract: PluginContract;
  private loadContext: Context;

  constructor(
    public readonly pluginName: string,
    installPath: string,
    packageJSON: IPackageJson,
    pluginId: string,
    contract: PluginContract,
    public readonly scope?: string,
  ) {
    this.logger = container.resolve<LoggerService>('logger');
    this.configService = container.resolve<ConfigService>('configService');

    this.installPath = join(installPath);
    this.id = pluginId;
    this.storagePath = join(this.configService.PLUGINS_STORAGE_PATH, this.pluginName);
    this.logPath = join(this.configService.LOGS_PATH, `plugin-${this.id}.log`);

    this.main = resolvePluginMain(packageJSON);
    this.mainPath = join(this.installPath, dirname(this.main));
    this.isPython = this.main.endsWith('.py');
    this.isGo = this.main.endsWith('.go');
    this.isSymLink = lstatSync(this.installPath).isSymbolicLink();

    this._contract = contract;
    this._info = this.parsePackageJson(packageJSON, installPath);

    this.displayName = this.info.displayName;

    this.loadContext = {
      engines: packageJSON.engines,
      dependencies: packageJSON.dependencies,
    };

    this.worker = new PluginWorker(this);

    this.disabled = this.configService.config.plugins.disabledPlugins.includes(pluginName);
  }

  public get contract(): PluginContract {
    return this._contract;
  }

  public get info(): CameraUiPlugin {
    this._info.disabled = this.disabled;
    this._info.restartRequired = this.restartRequired;
    return this._info;
  }

  public set info(value: CameraUiPlugin) {
    this._info = value;
    this._info.disabled = this.disabled;
    this._info.restartRequired = this.restartRequired;
  }

  public get restartRequired(): boolean {
    return this.runningVersion !== undefined && this.runningVersion !== this._info.installedVersion;
  }

  public get disabled(): boolean {
    return this._disabled;
  }

  public set disabled(disabled: boolean) {
    this._disabled = disabled;
    this._info.disabled = disabled;

    if (disabled) {
      this.worker.disable();
    }
  }

  public updateMainFromBundle(bundlePackageJSON: IPackageJson): void {
    this.main = resolvePluginMain(bundlePackageJSON);
    this.mainPath = join(this.installPath, 'bundle', dirname(this.main));
    this.isPython = this.main.endsWith('.py');
    this.isGo = this.main.endsWith('.go');
  }

  public async load(): Promise<void> {
    const issues = checkEngineCompatibility(this.loadContext.engines, ConfigService.VERSION, process.version);

    for (const issue of issues) {
      if (issue.engine === 'camera.ui') {
        this.logger.warn(`The plugin "${this.pluginName}" requires a camera.ui version of ${issue.required} which does \
not satisfy the current camera.ui version of ${ConfigService.VERSION}. Please update camera.ui to the required version.`);
      } else {
        this.logger.warn(`The plugin "${this.pluginName}" requires Node.js version of ${issue.required} which does \
not satisfy the current Node.js version of ${process.version}. You may need to upgrade your installation of Node.js`);
      }
    }
  }

  public async reparsePackageJson(): Promise<void> {
    const pjson = PluginManager.loadPackageJSON(this.installPath);
    this._contract = await PluginManager.parseContractAsync(this.installPath, pjson);
    this._info = this.parsePackageJson(pjson, this.installPath);
  }

  private parsePackageJson(pjson: IPackageJson, installPath: string): CameraUiPlugin {
    const pluginPackageJson: CameraUiPlugin = {
      id: this.id,
      disabled: this.configService.config.plugins.disabledPlugins.includes(this.pluginName),
      private: pjson.private ?? false,
      pluginName: pjson.name,
      displayName: pjson.displayName ?? PluginManager.transformDisplaName(pjson.name),
      author: pjson.author ? (typeof pjson.author === 'string' ? pjson.author : pjson.author.name) : undefined,
      description: pjson.description ? pjson.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '').trim() : pjson.name,
      installedVersion: pjson.version,
      latestVersion: pjson.version,
      globalInstall: false,
      publicPackage: pjson.private ?? false,
      engines: pjson.engines,
      installPath,
      links: {
        npm: `https://www.npmjs.com/package/${this.pluginName}`,
        homepage: pjson.homepage,
      },
      isPython: this.isPython,
      isGo: this.isGo,
      isNode: !this.isPython && !this.isGo,
      contract: this._contract,
      os: pjson.os,
      cpu: pjson.cpu,
      compatible: isPlatformCompatible(pjson.os, pjson.cpu),
    };

    return pluginPackageJson;
  }
}
