import { pathExists, readJson } from 'fs-extra/esm';
import { dirname, join } from 'node:path';

import { WorkersService } from '../../api/services/workers.service.js';
import { extractBundledPlugin } from '../../plugins/bundle.js';
import { PluginManager } from '../../plugins/index.js';
import { resolvePluginMain } from '../../plugins/main-file.js';
import { RuntimeFactory } from '../../plugins/runtime/index.js';
import { isShuttingDown } from '../../shutdown-state.js';
import { extractPackage, installDependencies } from '../../utils/npm/index.js';
import { describePlatformRequirement, isPlatformCompatible } from '../../utils/platform.js';
import { WorkerCapability } from '../types.js';

import type { LogEntry, Logger } from '@camera.ui/common/logger';
import type { IPackageJson } from '../../api/types/index.js';
import type { BasePluginRuntime, RuntimePlugin } from '../../plugins/runtime/base.js';
import type { ConfigService } from '../../services/config/index.js';
import type { RemotePluginConfig, RemotePluginState, RemotePluginStatus } from '../types.js';
import type { CapabilityHandler } from './handler.js';

const PROVISION_RETRY_MS = 30_000;
const CRASH_RESTART_MS = 5_000;

interface ManagedPlugin {
  spec: RemotePluginConfig;
  runtime?: BasePluginRuntime;
  stopped: boolean;
  state: RemotePluginState;
  retryTimer?: NodeJS.Timeout;
}

export class PluginHostHandler implements CapabilityHandler<WorkerCapability.PluginHost> {
  public readonly capability = WorkerCapability.PluginHost;

  private plugins = new Map<string, ManagedPlugin>();
  private isClosed = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: Logger,
    private readonly forwardLog: (entry: LogEntry) => void,
  ) {}

  public async start(id: string, spec: RemotePluginConfig): Promise<void> {
    const existing = this.plugins.get(id);
    if (existing) {
      await this.stop(id);
    }

    this.logger.log(`Hosting plugin: ${spec.displayName} (${spec.pluginName}@${spec.version})`);

    const managed: ManagedPlugin = { spec, stopped: false, state: 'installing' };
    this.plugins.set(id, managed);

    this.provisionAndStart(managed);
  }

  public async stop(id: string): Promise<void> {
    const managed = this.plugins.get(id);
    if (!managed) {
      return;
    }

    this.logger.log(`Stopping hosted plugin: ${managed.spec.displayName} (${id})`);

    managed.stopped = true;
    this.plugins.delete(id);

    if (managed.retryTimer) {
      clearTimeout(managed.retryTimer);
      managed.retryTimer = undefined;
    }

    if (managed.runtime) {
      await managed.runtime.stop();
      managed.runtime.cleanup();
      managed.runtime = undefined;
    }
  }

  public async stopAll(): Promise<void> {
    this.isClosed = true;

    const stopPromises = Array.from(this.plugins.keys()).map((id) => this.stop(id));
    await Promise.allSettled(stopPromises);
  }

  public getActiveWorkIds(): string[] {
    return Array.from(this.plugins.keys());
  }

  public getActiveProcessIds(): number[] {
    const pids: number[] = [];
    for (const managed of this.plugins.values()) {
      const pid = managed.runtime?.getPID();
      if (pid) {
        pids.push(pid);
      }
    }
    return pids;
  }

  public getPluginStatuses(): RemotePluginStatus[] {
    return Array.from(this.plugins, ([id, managed]) => ({ id, state: managed.state }));
  }

  private async provisionAndStart(managed: ManagedPlugin): Promise<void> {
    const { spec } = managed;

    managed.state = 'installing';

    try {
      const installPath = await this.ensureInstalled(spec);
      if (managed.stopped || this.isClosed) {
        return;
      }

      const plugin = await this.buildRuntimePlugin(spec, installPath);

      const runtime = RuntimeFactory.createRuntime(plugin);
      runtime.logForwarder = this.forwardLog;
      runtime.once('exit', () => {
        if (managed.stopped || this.isClosed || isShuttingDown()) {
          return;
        }
        managed.state = 'retrying';
        this.logger.warn(`Hosted plugin ${spec.displayName} exited — restarting in ${CRASH_RESTART_MS / 1000}s`);
        this.scheduleRetry(managed, CRASH_RESTART_MS);
      });

      managed.runtime = runtime;
      await runtime.start();

      managed.state = 'running';
      this.logger.log(`Hosted plugin started: ${spec.displayName} (${spec.pluginName}@${spec.version})`);
    } catch (error: any) {
      managed.runtime?.cleanup();
      managed.runtime = undefined;
      managed.state = 'retrying';

      if (managed.stopped || this.isClosed) {
        return;
      }
      this.logger.error(`Failed to provision/start plugin ${spec.pluginName}: ${error.message} — retrying in ${PROVISION_RETRY_MS / 1000}s`);
      this.scheduleRetry(managed, PROVISION_RETRY_MS);
    }
  }

  private scheduleRetry(managed: ManagedPlugin, delayMs: number): void {
    if (managed.retryTimer) {
      clearTimeout(managed.retryTimer);
    }

    managed.retryTimer = setTimeout(() => {
      managed.retryTimer = undefined;
      if (managed.stopped || this.isClosed || isShuttingDown()) {
        return;
      }
      this.provisionAndStart(managed);
    }, delayMs);
  }

  private async ensureInstalled(spec: RemotePluginConfig): Promise<string> {
    const installPath = join(this.configService.PLUGINS_INSTALL_PATH, spec.pluginName);

    const installed = await readJson(join(installPath, 'package.json')).catch(() => null);
    if (installed?.version !== spec.version) {
      this.logger.log(`Installing ${spec.pluginName}@${spec.version} (was: ${installed?.version ?? 'not installed'})`);
      await extractPackage(`${spec.pluginName}@${spec.version}`, installPath);
      await installDependencies(installPath, this.configService.config.plugins.allowBuildScripts ?? false, (chunk) => this.logger.debug(chunk.toString().trim()), {
        add: (proc) => this.configService.addProcess(proc),
        remove: (pid) => this.configService.removeProcessByPID(pid),
      });
      await extractBundledPlugin(installPath);
    }

    return installPath;
  }

  private async buildRuntimePlugin(spec: RemotePluginConfig, installPath: string): Promise<RuntimePlugin> {
    const pjson = (await readJson(join(installPath, 'package.json'))) as IPackageJson;

    if (!isPlatformCompatible(pjson.os, pjson.cpu)) {
      throw new Error(`plugin requires ${describePlatformRequirement(pjson.os, pjson.cpu)}, this worker is ${process.platform}/${process.arch}`);
    }

    let main = resolvePluginMain(pjson);
    let mainPath = join(installPath, dirname(main));

    const bundlePackageJsonPath = join(installPath, 'bundle', 'package.json');
    if (await pathExists(bundlePackageJsonPath)) {
      const bundlePjson = (await readJson(bundlePackageJsonPath)) as IPackageJson;
      main = resolvePluginMain(bundlePjson);
      mainPath = join(installPath, 'bundle', dirname(main));
    }

    const contractFile = await PluginManager.loadContractFile(installPath);
    const pythonVersion = contractFile ? PluginManager.normalizeContract(contractFile, spec.pluginName).pythonVersion : undefined;
    const masterAddress = new WorkersService().getWorkerConnection()?.master;

    return {
      id: spec.pluginId,
      pluginName: spec.pluginName,
      displayName: spec.displayName,
      main,
      mainPath,
      installPath,
      isPython: main.endsWith('.py'),
      isGo: main.endsWith('.go'),
      info: { installedVersion: pjson.version },
      contract: { pythonVersion },
      remoteEnv: {
        CAMERAUI_MASTER_ADDRESS: masterAddress,
        CAMERAUI_RTSP_USERNAME: spec.rtspUsername,
        CAMERAUI_RTSP_PASSWORD: spec.rtspPassword,
      },
    };
  }
}
