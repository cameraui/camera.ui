import { sleep } from '@camera.ui/common/utils';
import { move, pathExists, readJson, remove } from 'fs-extra/esm';
import { lstat, readdir, rename } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { WorkersService } from '../../api/services/workers.service.js';
import { checkBundledPlugin, extractBundledPlugin } from '../../plugins/bundle.js';
import { PluginManager } from '../../plugins/index.js';
import { pythonEnvEntries, readInstallMarker, writeInstallMarker } from '../../plugins/install-state.js';
import { resolvePluginMain } from '../../plugins/main-file.js';
import { RuntimeFactory } from '../../plugins/runtime/index.js';
import { NamespaceManager } from '../../rpc/namespaces.js';
import { workerName } from '../../services/config/defaults.js';
import { checkProtocolCompat } from '../../utils/engines.js';
import { extractArtifact, installDependencies } from '../../utils/npm/index.js';
import { describeHost, describePlatformRequirement, isPlatformCompatible, platformRequirement } from '../../utils/platform.js';
import { KeyedLock, Slots } from '../lifecycle/limits.js';
import { ManagedWorkload, ProvisionError } from '../lifecycle/managed-workload.js';
import { WorkerCapability } from '../types.js';
import { stopEach } from './handler.js';

import type { LogEntry, Logger } from '@camera.ui/common/logger';
import type { IPackageJson } from '../../api/types/index.js';
import type { InstallArtifact } from '../../plugins/install-state.js';
import type { RuntimePlugin } from '../../plugins/runtime/base.js';
import type { ConfigService } from '../../services/config/index.js';
import type { ChildExit } from '../../utils/supervised-child.js';
import type { StopReason, WorkloadDriver, WorkloadHooks, WorkloadProcess } from '../lifecycle/managed-workload.js';
import type { WorkloadMode, WorkloadPhase } from '../lifecycle/workload.js';
import type { PluginBuild, PluginInstallReport, RemotePluginConfig, RemotePluginState, RemotePluginStatus, WorkerProcessRef, WorkloadLive } from '../types.js';
import type { CapabilityHandler, HostedStatus } from './handler.js';

const START_SLOTS = 2;

interface PluginSettings {
  config: RemotePluginConfig;
  live?: WorkloadLive;
  version?: string;
  linked?: boolean;
}

interface HostedPlugin {
  settings: PluginSettings;
  workload: ManagedWorkload;
}

interface InstallState {
  version?: string;
  artifact?: InstallArtifact;
  finished: boolean;
}

type StagedBuild = PluginBuild & { pluginName: string };

export class PluginHostHandler implements CapabilityHandler<WorkerCapability.PluginHost> {
  public readonly capability = WorkerCapability.PluginHost;

  private plugins = new Map<string, HostedPlugin>();
  private stopping = new Map<HostedPlugin, { id: string; stopped: Promise<void> }>();
  private installs = new Map<string, PluginInstallReport>();
  private prepares = new Map<string, AbortController>();
  private folders = new KeyedLock();
  private slots = new Slots(START_SLOTS);
  private isClosed = false;

  constructor(
    private readonly agentId: string,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
    private readonly forwardLog: (entry: LogEntry) => void,
    private readonly mode: () => WorkloadMode,
    private readonly hooks: WorkloadHooks = {},
  ) {}

  public async start(id: string, spec: RemotePluginConfig, live?: WorkloadLive): Promise<void> {
    await this.stop(id);
    if (this.isClosed) {
      return;
    }

    const settings: PluginSettings = { config: spec, live };
    this.logger.log(`Hosting plugin: ${displayName(settings)} (${spec.pluginName}@${spec.version})`);

    const workload = new ManagedWorkload(this.driver(settings), this.logger, this.mode, this.hooks);
    this.plugins.set(id, { settings, workload });
    workload.start();
    // restarted while staging the next version, stage it again
    if (live?.prepare && live.prepare.version !== spec.version) {
      this.prepare({ ...live.prepare, pluginName: spec.pluginName });
    }
  }

  public async stop(id: string, reason?: StopReason, budgetMs?: number): Promise<HostedStatus | undefined> {
    const hosted = this.plugins.get(id);
    if (!hosted) {
      return undefined;
    }

    this.logger.log(`Stopping hosted plugin: ${displayName(hosted.settings)} (${id})`);
    this.plugins.delete(id);
    const stopped = hosted.workload.stop(reason, budgetMs);
    this.stopping.set(hosted, { id, stopped });
    try {
      await stopped;
    } finally {
      this.stopping.delete(hosted);
    }
    this.hooks.onChange?.();
    return hosted.workload.status;
  }

  public async stopAll(reason?: StopReason, budgetMs?: number): Promise<Map<string, HostedStatus>> {
    return stopEach(this.plugins.keys(), (id) => this.stop(id, reason, budgetMs));
  }

  public async close(): Promise<void> {
    this.isClosed = true;
    for (const abort of this.prepares.values()) abort.abort();
    await this.stopAll();
  }

  public stillDesired(id: string): void {
    this.plugins.get(id)?.workload.stillDesired();
  }

  public setLive(id: string, live: WorkloadLive | undefined): void {
    const hosted = this.plugins.get(id);
    if (hosted) {
      hosted.settings.live = live;
      if (live?.prepare) {
        this.prepare({ ...live.prepare, pluginName: hosted.settings.config.pluginName });
      }
    }
  }

  public status(id: string): HostedStatus | undefined {
    const hosted = this.plugins.get(id);
    if (!hosted) {
      return undefined;
    }
    const { pluginName } = hosted.settings.config;
    return { ...hosted.workload.status, version: hosted.settings.version, linked: hosted.settings.linked, install: this.installs.get(pluginName) };
  }

  public async purge(pluginName: string, storage: boolean): Promise<void> {
    await this.stop(pluginName);
    await Promise.allSettled(
      Array.from(this.stopping.values())
        .filter(({ id }) => id === pluginName)
        .map(({ stopped }) => stopped),
    );
    this.prepares.get(pluginName)?.abort();
    this.installs.delete(pluginName);

    const installPath = this.installPathOf(pluginName);
    const signal = new AbortController().signal;
    await this.folders.run(pluginName, signal, () =>
      this.folders.run(stagingKey(pluginName), signal, async () => {
        const linked = (await lstat(installPath).catch(() => null))?.isSymbolicLink() === true;
        for (const path of [...(linked ? [] : [installPath, `${installPath}.previous`]), ...(await this.stagingDirs(installPath))]) {
          await remove(path);
        }
        if (storage) {
          await PluginManager.removeSparingKeptDirs(join(this.configService.PLUGINS_STORAGE_PATH, pluginName));
        }
      }),
    );
    this.logger.log(`Removed plugin ${pluginName} from this worker, it was uninstalled`);
  }

  public getActiveWorkIds(): string[] {
    return Array.from(this.plugins.keys());
  }

  public getActiveProcesses(): WorkerProcessRef[] {
    const refs: WorkerProcessRef[] = [];
    for (const [id, hosted] of [...this.plugins, ...Array.from(this.stopping, ([stopping, { id: stoppingId }]) => [stoppingId, stopping] as const)]) {
      const pid = hosted.workload.pid;
      if (pid && pid > 0) {
        refs.push({ capability: this.capability, id, pid });
      }
    }
    return refs;
  }

  public getPluginStatuses(): RemotePluginStatus[] {
    return Array.from(this.plugins, ([id, hosted]) => ({ id, state: reportedState(hosted.workload.phase) }));
  }

  private driver(settings: PluginSettings): WorkloadDriver {
    const spec = settings.config;
    let plugin: RuntimePlugin | undefined;

    return {
      get label() {
        return `Plugin ${displayName(settings)}`;
      },
      provisions: true,
      provision: (signal) =>
        this.folders.run(spec.pluginName, signal, async () => {
          const installPath = await this.ensureInstalled(settings, signal);
          signal.throwIfAborted();
          plugin = await this.buildRuntimePlugin(spec, installPath);
          await this.prepareRuntime(settings, plugin, signal);
        }),
      spawn: (signal, instanceId) =>
        this.slots.run(signal, () =>
          this.folders.run(spec.pluginName, signal, async (): Promise<WorkloadProcess> => {
            if (!plugin) {
              throw new Error('plugin is not provisioned');
            }

            const runtime = RuntimeFactory.createRuntime({ ...plugin, displayName: displayName(settings) });
            runtime.logForwarder = this.forwardLog;
            const exited = new Promise<ChildExit>((resolve) =>
              runtime.once('exit', (exit: ChildExit) => {
                runtime.cleanup();
                resolve(exit);
              }),
            );

            try {
              await runtime.start(signal, instanceId);
            } catch (error) {
              runtime.cleanup();
              throw error;
            }

            this.logger.log(`Hosted plugin started: ${displayName(settings)} (${spec.pluginName}@${spec.version})`);
            return {
              get pid() {
                return runtime.getPID() || undefined;
              },
              exited,
              stop: (budgetMs) => runtime.stop(budgetMs),
            };
          }),
        ),
    };
  }

  private async ensureInstalled(settings: PluginSettings, signal: AbortSignal): Promise<string> {
    const spec = settings.config;
    const installPath = this.installPathOf(spec.pluginName);

    settings.linked = (await lstat(installPath).catch(() => null))?.isSymbolicLink() === true;
    if (settings.linked) {
      settings.version = (await readJson(join(installPath, 'package.json')).catch(() => null))?.version;
      if (settings.version !== spec.version) {
        this.logger.warn(`${spec.pluginName} is a linked dev install (${settings.version ?? 'link points nowhere'}), the master runs ${spec.version}; not replaced`);
      }
      return installPath;
    }

    await this.recoverSwap(installPath);
    const installed = await inspectInstall(installPath);
    settings.version = installed.finished ? installed.version : undefined;
    if (installed.finished && sameBuild(installed, spec)) {
      return installPath;
    }

    const was = installed.version ? `${installed.version}${installed.finished ? '' : ', unfinished'}` : 'not installed';
    await this.folders.run(stagingKey(spec.pluginName), signal, async () => {
      this.logger.log(
        (await this.isStaged(spec))
          ? `Switching to ${spec.pluginName}@${spec.version}, installed beside the running version (was: ${was})`
          : `Installing ${spec.pluginName}@${spec.version} (was: ${was})`,
      );
      const staged = await this.stage(spec, signal);
      signal.throwIfAborted();
      await this.swap(spec.pluginName, staged, installPath);
    });
    settings.version = spec.version;
    return installPath;
  }

  private async prepareRuntime(settings: PluginSettings, plugin: RuntimePlugin, signal: AbortSignal): Promise<void> {
    if (!plugin.isPython) return;
    const { pluginName, version } = settings.config;
    // a version staged ahead keeps its report
    const ahead = this.installs.get(pluginName);
    const reports = !ahead || ahead.version === version;

    const runtime = RuntimeFactory.createRuntime({ ...plugin, displayName: displayName(settings) });
    runtime.logForwarder = this.forwardLog;
    if (reports) this.setInstall(pluginName, { version, step: 'dependencies' });
    try {
      await runtime.prepare(signal);
    } finally {
      runtime.cleanup();
      if (reports) this.setInstall(pluginName, undefined);
    }
  }

  private async stage(build: StagedBuild, signal: AbortSignal): Promise<string> {
    const staging = this.stagingPathOf(build);
    if (await this.isStaged(build)) {
      this.setInstall(build.pluginName, { version: build.version, step: 'staged' });
      return staging;
    }

    await remove(staging);
    try {
      this.setInstall(build.pluginName, { version: build.version, step: 'download' });
      const manifest = await extractArtifact(build.pluginName, build.version, build, staging, signal);
      signal.throwIfAborted();

      this.setInstall(build.pluginName, { version: build.version, step: 'dependencies' });
      await installDependencies(staging, this.configService.config.plugins.allowBuildScripts ?? false, (chunk) => this.logger.debug(chunk.toString().trim()), {
        add: (proc) => this.configService.addProcess(proc),
        remove: (pid) => this.configService.removeProcessByPID(pid),
      });
      signal.throwIfAborted();
      await extractBundledPlugin(staging);
      await writeInstallMarker(staging, { version: manifest.version, integrity: manifest.dist.integrity, tarball: manifest.dist.tarball });
    } catch (error) {
      await remove(staging).catch(() => {});
      if (signal.aborted) {
        this.setInstall(build.pluginName, undefined);
      } else {
        this.setInstall(build.pluginName, { version: build.version, step: 'failed', error: error instanceof Error ? error.message : String(error) });
      }
      throw installFailure(error);
    }

    this.setInstall(build.pluginName, { version: build.version, step: 'staged' });
    return staging;
  }

  private stagingPathOf(build: StagedBuild): string {
    return `${this.installPathOf(build.pluginName)}.staging-${build.version}`;
  }

  private async isStaged(build: StagedBuild): Promise<boolean> {
    const ready = await inspectInstall(this.stagingPathOf(build));
    return !!ready.artifact && ready.finished && sameBuild(ready, build);
  }

  private async swap(pluginName: string, staged: string, installPath: string): Promise<void> {
    const previous = `${installPath}.previous`;
    await remove(previous);
    const hadPrevious = await pathExists(installPath);
    if (hadPrevious) {
      await renameUnlocked(installPath, previous);
    }
    try {
      await renameUnlocked(staged, installPath);
    } catch (error) {
      if (hadPrevious) {
        await rename(previous, installPath).catch(() => {});
      }
      throw error;
    }

    if (hadPrevious) {
      await this.dropPrevious(installPath, previous);
    }
    for (const stale of await this.stagingDirs(installPath)) {
      await remove(stale).catch(() => {});
    }
    this.setInstall(pluginName, undefined);
  }

  private async recoverSwap(installPath: string): Promise<void> {
    const previous = `${installPath}.previous`;
    if (!(await pathExists(previous))) {
      return;
    }
    if (await pathExists(installPath)) {
      await this.dropPrevious(installPath, previous);
      return;
    }
    await rename(previous, installPath);
    this.logger.warn(`${basename(installPath)}: put the previous install back, the last update stopped half way`);
  }

  private async dropPrevious(installPath: string, previous: string): Promise<void> {
    for (const name of await pythonEnvEntries(previous)) {
      await move(join(previous, name), join(installPath, name), { overwrite: true });
    }
    await remove(previous).catch(() => {});
  }

  private async stagingDirs(installPath: string): Promise<string[]> {
    const prefix = `${basename(installPath)}.staging-`;
    const entries = await readdir(dirname(installPath)).catch(() => []);
    return entries.filter((entry) => entry.startsWith(prefix)).map((entry) => join(dirname(installPath), entry));
  }

  private prepare(build: StagedBuild): void {
    const current = this.installs.get(build.pluginName);
    if (current?.version === build.version) {
      return;
    }
    this.prepares.get(build.pluginName)?.abort();
    const abort = new AbortController();
    this.prepares.set(build.pluginName, abort);

    this.logger.log(`Preparing ${build.pluginName}@${build.version} beside the running version`);
    // staging lock, not the install folder: a restart must not wait for the download
    this.folders
      .run(stagingKey(build.pluginName), abort.signal, async () => {
        const installed = await inspectInstall(this.installPathOf(build.pluginName));
        if (installed.finished && sameBuild(installed, build)) {
          return;
        }
        await this.stage(build, abort.signal);
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          this.logger.warn(`Could not prepare ${build.pluginName}@${build.version}: ${error instanceof Error ? error.message : error}`);
        }
      })
      .finally(() => {
        if (this.prepares.get(build.pluginName) === abort) {
          this.prepares.delete(build.pluginName);
        }
      });
  }

  private setInstall(pluginName: string, install: PluginInstallReport | undefined): void {
    if (install) {
      this.installs.set(pluginName, install);
    } else {
      this.installs.delete(pluginName);
    }
    this.hooks.onChange?.();
  }

  private installPathOf(pluginName: string): string {
    return join(this.configService.PLUGINS_INSTALL_PATH, pluginName);
  }

  private async buildRuntimePlugin(spec: RemotePluginConfig, installPath: string): Promise<RuntimePlugin> {
    const pjson = (await readJson(join(installPath, 'package.json'))) as IPackageJson;

    if (!isPlatformCompatible(platformRequirement(pjson))) {
      throw new ProvisionError(`plugin requires ${describePlatformRequirement(platformRequirement(pjson))}, this worker is ${describeHost()}`, 'platform');
    }

    const protocolCompat = checkProtocolCompat(pjson.cameraui?.protocolLevel);
    if (protocolCompat === 'pluginTooOld') {
      throw new ProvisionError(`plugin ${spec.pluginName} was built for an older camera.ui plugin API, update the plugin`, 'gated');
    }
    if (protocolCompat === 'serverTooOld') {
      throw new ProvisionError(`plugin ${spec.pluginName} was built for a newer camera.ui plugin API, update this worker`, 'gated');
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
      displayName: spec.displayName ?? spec.pluginName,
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
        CAMERAUI_WORKER_LINK_SUBJECT: NamespaceManager.workerLinkSubject(this.agentId),
        CAMERAUI_WORKER_ID: this.agentId,
        CAMERAUI_WORKER_NAME: workerName(this.configService.config.worker),
      },
    };
  }
}

async function inspectInstall(installPath: string): Promise<InstallState> {
  const version = (await readJson(join(installPath, 'package.json')).catch(() => null))?.version as string | undefined;
  if (!version) {
    return { finished: false };
  }
  const artifact = await readInstallMarker(installPath);
  if (artifact) {
    return { version, artifact, finished: artifact.version === version };
  }
  // no marker: a bundle still packed stopped half way
  return { version, finished: (await checkBundledPlugin(installPath)) === undefined };
}

function sameBuild(installed: InstallState, build: PluginBuild): boolean {
  if (installed.version !== build.version) return false;
  return !build.integrity || !installed.artifact?.integrity || installed.artifact.integrity === build.integrity;
}

function installFailure(error: unknown): unknown {
  const code = (error as { code?: string } | undefined)?.code;
  if (code === 'E404' || code === 'ETARGET' || code === 'EINTEGRITY') {
    return new ProvisionError(error instanceof Error ? error.message : String(error), 'install');
  }
  return error;
}

async function renameUnlocked(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'EPERM' && code !== 'EBUSY') throw error;
    await sleep(2000);
    await rename(from, to);
  }
}

function stagingKey(pluginName: string): string {
  return `${pluginName}#staging`;
}

function displayName(settings: PluginSettings): string {
  return settings.live?.displayName ?? settings.config.displayName ?? settings.config.pluginName;
}

function reportedState(phase: WorkloadPhase): RemotePluginState {
  switch (phase) {
    case 'provisioning':
    case 'spawning':
      return 'installing';
    case 'running':
      return 'running';
    default:
      return 'retrying';
  }
}
