import { APP_SERVER_NAME, IS_DEV, npmCommand } from '@camera.ui/common';
import {
  killTree,
  LOG_APPEND_ONLY_ENV,
  readRegistrySync,
  REAP_GRACE_MS,
  reapRegistry,
  SHUTDOWN_DEADLINE_MS,
  SUPERVISOR_IPC_ENV,
  SUPERVISOR_IPC_LEVEL,
  supervisorSpeaksShutdown,
  UPDATE_STATE_FILE,
  writeFileAtomic,
} from '@camera.ui/common/node';
import { fork, spawn } from 'node:child_process';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import type {
  ReapResult,
  ServerHealthyMessage,
  ServerStartedMessage,
  ShutdownReason,
  SupervisorRolledBackMessage,
  SupervisorShutdownMessage,
  UpdateState,
} from '@camera.ui/common/node';
import type { ForkOptions } from 'child_process';
import type { ChildProcess } from 'node:child_process';
import type { CameraUiCLI } from './cameraui.js';

const STOPPING_ACK_MS = 1000;
const LEGACY_KILL_MS = 8000;
const HEALTHY_WINDOW_MS = 5 * 60_000;
const LEGACY_STABLE_MS = 120_000;
const ROLLBACK_AFTER_CRASHES = 3;
const HOME_TAKEN_ERROR = 'Another camera.ui is already running with the home ';
const UPDATE_LOCK_OWNER = `${process.pid} ${Math.round(performance.timeOrigin)}`;

interface UpdateMessage {
  type: 'UPDATE_SERVER';
  version?: string;
}

interface ErrorMessage {
  type: 'START_ERROR';
  error?: string;
  fatal?: boolean;
}

interface StoppingMessage {
  type: 'STOPPING';
}

type ServerMessage = UpdateMessage | ErrorMessage | ServerStartedMessage | ServerHealthyMessage | StoppingMessage;

interface UpdateStartedMessage {
  type: 'UPDATE_STARTED';
  version: string;
}

interface UpdateOutputMessage {
  type: 'UPDATE_OUTPUT';
  data: string;
}

interface UpdateErrorMessage {
  type: 'UPDATE_ERROR';
  data: string;
}

interface UpdateCompleteMessage {
  type: 'UPDATE_COMPLETE';
  version: string;
}

interface UpdateFailedMessage {
  type: 'UPDATE_FAILED';
  error: string;
}

type CLIMessage =
  UpdateStartedMessage | UpdateOutputMessage | UpdateErrorMessage | UpdateCompleteMessage | UpdateFailedMessage | SupervisorShutdownMessage | SupervisorRolledBackMessage;

interface HealthGate {
  from: string;
  to: string;
  crashes: number;
  lastCrash?: string;
  window: NodeJS.Timeout;
  stable?: NodeJS.Timeout;
}

function isNetworkError(error: unknown): boolean {
  const err = error as { message?: string; stderr?: string };
  const haystack = `${err.message ?? ''}\n${err.stderr ?? ''}`.toLowerCase();
  return /econnreset|etimedout|esockettimedout|eai_again|enotfound|econnrefused|socket hang up|epipe|network|aborted|fetch failed/.test(haystack);
}

function describeReaped({ entry }: ReapResult): string {
  return `${basename(entry.command)} (${entry.pid})`;
}

export class ServerManager {
  public serverCrashed = false;

  private readonly SERVER_DIR = 'server';
  private readonly serverBinName = IS_DEV ? 'cameraui-server.ts' : 'cameraui-server';
  private readonly binDir = IS_DEV ? 'bin' : '.bin';
  private readonly cliDirectory: string;

  private cli: CameraUiCLI;
  private forkedProcess?: ChildProcess;
  private onCloseHandler?: (code: number | null, signal: NodeJS.Signals | null) => void;
  private updating = false;
  private started?: ServerStartedMessage;
  private stoppingSeen = false;
  private stopRequested = false;
  private homeTaken = false;
  private healthGate?: HealthGate;
  private rolledBack?: SupervisorRolledBackMessage;
  private reapTimer?: NodeJS.Timeout;
  private reaping = Promise.resolve();

  constructor(cli: CameraUiCLI) {
    this.cli = cli;
    this.cliDirectory = dirname(this.cli.selfPath);
  }

  public get isRunning(): boolean {
    return this.forkedProcess?.connected ?? false;
  }

  private get serverPath(): string {
    if (IS_DEV) {
      return join(this.cliDirectory, '..', '..', this.SERVER_DIR);
    }

    return join(this.cli.homePath, this.SERVER_DIR);
  }

  private get serverStatePath(): string {
    return join(this.serverPath, 'install.json');
  }

  private get serverModulesPath(): string {
    return join(this.serverPath, 'node_modules');
  }

  private get serverBackupPath(): string {
    return `${this.serverModulesPath}.bak`;
  }

  private get updateStatePath(): string {
    return join(this.serverPath, UPDATE_STATE_FILE);
  }

  private get pidsFilePath(): string {
    return join(this.cli.storagePath, 'camera.ui.pids');
  }

  private get serverBinPath(): string {
    if (!IS_DEV && process.platform === 'win32') {
      return join(this.serverModulesPath, APP_SERVER_NAME, 'dist', 'server', 'bin', 'cameraui-server.js');
    }

    const serverBinDirPath = IS_DEV ? this.serverPath : this.serverModulesPath;
    return join(serverBinDirPath, this.binDir, this.serverBinName);
  }

  private get serverPackageJsonPath(): string {
    return join(this.serverPath, APP_SERVER_NAME, 'package.json');
  }

  private isServerHealthy(): boolean {
    return existsSync(join(this.serverModulesPath, APP_SERVER_NAME, 'package.json')) && existsSync(this.serverBinPath);
  }

  public async ensureInstalled(): Promise<void> {
    if (IS_DEV) {
      if (!existsSync(this.serverBinPath)) {
        throw new Error(`Server source not found at: ${this.serverBinPath}`);
      }
      return;
    }

    try {
      await mkdir(this.serverPath, { recursive: true });
      await this.cli.chownPath(this.serverPath);

      if (!existsSync(this.serverModulesPath) && existsSync(this.serverBackupPath)) {
        this.cli.logger('Restoring previous server install from backup (interrupted swap)', 'warn');
        renameSync(this.serverBackupPath, this.serverModulesPath);
      }

      await this.finalizeStagedInstall();

      const installed = existsSync(join(this.serverModulesPath, APP_SERVER_NAME));
      const state = this.readState();
      const abiChanged = installed && state.nodeAbi !== undefined && state.nodeAbi !== process.versions.modules;
      const incomplete = installed && !this.isServerHealthy();

      if (abiChanged || incomplete) {
        const reason = abiChanged ? `Node ABI changed (${state.nodeAbi} -> ${process.versions.modules})` : 'server install is incomplete (interrupted update?)';
        this.cli.logger(`${reason}, reinstalling server`, 'info');
        rmSync(this.serverModulesPath, { recursive: true, force: true });
      }

      if (!installed || abiChanged || incomplete) {
        this.cli.logger('Installing camera.ui server ...', 'info');
        await this.stageInstall(state.version ?? 'latest', true);
        await this.finalizeStagedInstall();

        if (!this.isServerHealthy()) {
          throw new Error('Server install verification failed, files incomplete after install');
        }
      }
    } catch (error) {
      this.cli.logger(`Failed to manage server: ${error.message}`, 'fail');
      throw error;
    }
  }

  public async start(onClose: (code: number | null, signal: NodeJS.Signals | null) => void): Promise<void> {
    if (this.isRunning) {
      return;
    }

    // a reap still in flight must not race the children of the next server
    clearTimeout(this.reapTimer);
    await this.reaping;

    if (this.healthGate && this.healthGate.crashes >= ROLLBACK_AFTER_CRASHES) {
      await this.rollBack(this.healthGate);
    }

    await this.finalizeStagedInstall();
    // no server runs at this point, so nothing else holds the log
    await this.cli.rotateLog();

    if (this.stopRequested) {
      return;
    }

    if (!existsSync(this.serverBinPath)) {
      throw new Error(`Server binary not found at: ${this.serverBinPath}`);
    }

    this.reset();

    const env = {
      ...process.env,
      FORCE_COLOR: '1',
      [SUPERVISOR_IPC_ENV]: String(SUPERVISOR_IPC_LEVEL),
      [LOG_APPEND_ONLY_ENV]: '1',
      ...(IS_DEV ? { TSX_TSCONFIG_PATH: join(this.serverPath, 'tsconfig.json') } : {}),
    };

    const childProcessOpts: ForkOptions = {
      env,
      uid: this.cli.allowRunRoot && this.cli.uid ? this.cli.uid : undefined,
      gid: this.cli.allowRunRoot && this.cli.gid ? this.cli.gid : undefined,
      silent: true,
      // no shared console, so the Ctrl+C from NSSM reaches only the launcher
      windowsHide: true,
    };

    const forkArgs = [this.cli.homePath];
    if (this.cli.worker) {
      forkArgs.push('--worker');
    }

    this.forkedProcess = fork(this.serverBinPath, forkArgs, childProcessOpts);

    this.forkedProcess.stdout?.on('data', (data) => {
      const rawData: string = data.toString();
      this.cli.logger(rawData.replace(/\r?\n*$/, ''), 'raw');
    });

    this.forkedProcess.stderr?.on('data', (data) => {
      const rawData = data.toString();
      this.cli.logger(rawData.replace(/\r?\n*$/, ''), 'raw');
    });

    this.forkedProcess.on('message', this.handleServerMessage.bind(this));
    this.onCloseHandler = (code, signal) => {
      this.onServerExit(code, signal);
      onClose(code, signal);
    };
    this.forkedProcess.once('close', this.onCloseHandler);
  }

  public stop(reason: ShutdownReason): Promise<void> {
    this.stopRequested = true;

    const proc = this.forkedProcess;
    if (proc && this.onCloseHandler) {
      proc.removeListener('close', this.onCloseHandler);
      this.onCloseHandler = undefined;
    }

    // the last server may have exited already, its 'close' does not fire again
    if (proc?.exitCode !== null || proc.signalCode !== null) {
      this.reset();
      return this.reapLeftovers();
    }

    return new Promise<void>((resolve) => {
      const timers: NodeJS.Timeout[] = [];
      const done = (): void => {
        timers.forEach((timer) => clearTimeout(timer));
        this.reset();
        resolve();
      };

      proc.once('close', done);

      if (supervisorSpeaksShutdown(this.started)) {
        timers.push(...this.requestShutdown(proc, reason));
        return;
      }

      timers.push(
        setTimeout(() => {
          this.cli.logger('camera.ui did not exit in time; sending SIGKILL', 'warn');
          proc.kill('SIGKILL');
        }, LEGACY_KILL_MS),
      );

      proc.kill();
    }).then(() => this.reapLeftovers());
  }

  private reset(): void {
    this.forkedProcess?.removeAllListeners();
    this.forkedProcess?.stdout?.removeAllListeners();
    this.forkedProcess?.stderr?.removeAllListeners();
    this.forkedProcess?.stdout?.destroy();
    this.forkedProcess?.stderr?.destroy();
    this.forkedProcess = undefined;
    this.started = undefined;
    this.stoppingSeen = false;
  }

  public async update(version = 'latest', stdout?: boolean): Promise<void> {
    if (IS_DEV) {
      throw new Error('Updates are disabled in development mode');
    }

    if (this.updating) {
      throw new Error('Update already in progress');
    }

    this.updating = true;

    this.cli.logger(`Updating server to version ${version}...`, 'info');

    this.send({
      type: 'UPDATE_STARTED',
      version: version,
    });

    try {
      await this.stageInstall(version, stdout);

      this.send({
        type: 'UPDATE_COMPLETE',
        version: version,
      });

      this.cli.logger('Server update staged, applied on restart', 'succeed');
    } catch (error) {
      this.send({
        type: 'UPDATE_FAILED',
        error: error.message,
      });

      this.cli.logger(`Server update failed: ${error.message}`, 'fail');
      throw error;
    } finally {
      this.updating = false;
      this.cli.updateVersion = undefined;
    }
  }

  private async handleServerMessage(message: ServerMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'UPDATE_SERVER': {
          if (IS_DEV) {
            this.cli.logger('Server updates are disabled in development mode', 'warn');
            this.send({
              type: 'UPDATE_FAILED',
              error: 'Updates are disabled in development mode',
            });
            return;
          }

          this.cli.logger('Received update request from server', 'info');
          const version = message.version ?? 'latest';
          await this.update(version);
          break;
        }
        case 'START_ERROR': {
          if (message.fatal) {
            this.serverCrashed = true;
            this.homeTaken ||= (message.error ?? '').startsWith(HOME_TAKEN_ERROR);
          }
          break;
        }
        case 'STARTED': {
          this.started = message;
          this.onServerStarted();
          break;
        }
        case 'HEALTHY': {
          await this.acceptUpdate('is healthy');
          break;
        }
        case 'STOPPING': {
          this.stoppingSeen = true;
          break;
        }
      }
    } catch (error) {
      this.send({ type: 'UPDATE_FAILED', error: error.message });
    }
  }

  private onServerStarted(): void {
    if (this.rolledBack) {
      this.send(this.rolledBack);
      this.rolledBack = undefined;
    }

    const gate = this.healthGate;
    if (gate && !supervisorSpeaksShutdown(this.started)) {
      clearTimeout(gate.stable);
      gate.stable = setTimeout(() => this.acceptUpdate(`ran ${LEGACY_STABLE_MS / 1000} s without a crash`), LEGACY_STABLE_MS);
    }
  }

  private onServerExit(code: number | null, signal: NodeJS.Signals | null): void {
    const gate = this.healthGate;
    clearTimeout(gate?.stable);

    // exit code 0 is a restart the server asked for itself
    if (gate && code !== 0) {
      gate.crashes++;
      gate.lastCrash = signal ? `signal ${signal}` : `code ${code}`;
      if (gate.crashes >= ROLLBACK_AFTER_CRASHES) {
        clearTimeout(gate.window);
      }
    }

    clearTimeout(this.reapTimer);
    this.reapTimer = setTimeout(() => {
      if (!this.isRunning) {
        this.reapLeftovers();
      }
    }, REAP_GRACE_MS);
  }

  private requestShutdown(proc: ChildProcess, reason: ShutdownReason): NodeJS.Timeout[] {
    this.stoppingSeen = false;

    const message: SupervisorShutdownMessage = { type: 'SHUTDOWN', reason, deadlineMs: SHUTDOWN_DEADLINE_MS };
    proc.send(message, (error) => {
      if (error) {
        this.cli.logger(`Could not send the shutdown request to camera.ui (${error.message}), terminating it`, 'warn');
        proc.kill();
      }
    });

    return [
      setTimeout(() => {
        if (!this.stoppingSeen) {
          this.cli.logger(`camera.ui did not confirm the shutdown request within ${STOPPING_ACK_MS / 1000} s`, 'warn');
        }
      }, STOPPING_ACK_MS),
      setTimeout(() => {
        this.cli.logger(`camera.ui did not exit within ${SHUTDOWN_DEADLINE_MS / 1000} s, killing it`, 'warn');
        const { pid } = proc;
        if (pid) {
          killTree({ pid }).catch(() => proc.kill('SIGKILL'));
        } else {
          proc.kill('SIGKILL');
        }
      }, SHUTDOWN_DEADLINE_MS),
    ];
  }

  private reapLeftovers(): Promise<void> {
    clearTimeout(this.reapTimer);
    if (this.homeTaken) {
      return this.reaping;
    }

    this.reaping = this.reaping
      .then(async () => {
        const results = await reapRegistry(readRegistrySync(this.pidsFilePath));

        const killed = results.filter(({ outcome }) => outcome === 'killed');
        if (killed.length > 0) {
          this.cli.logger(`Stopped leftovers of the last camera.ui run: ${killed.map(describeReaped).join(', ')}`, 'warn');
        }

        for (const result of results.filter(({ outcome }) => outcome === 'failed')) {
          this.cli.logger(`Could not stop leftover process ${describeReaped(result)}: ${result.error?.message}`, 'warn');
        }
      })
      .catch((error) => this.cli.logger(`Could not clean up after camera.ui: ${error.message}`, 'warn'));

    return this.reaping;
  }

  private async armHealthGate(from: string, to: string): Promise<void> {
    this.closeHealthGate();

    await rm(this.updateStatePath, { force: true }).catch(() => {});

    this.healthGate = {
      from,
      to,
      crashes: 0,
      window: setTimeout(() => this.acceptUpdate(`did not report healthy within ${HEALTHY_WINDOW_MS / 60_000} min, keeping it`, 'warn'), HEALTHY_WINDOW_MS),
    };
  }

  private closeHealthGate(): HealthGate | undefined {
    const gate = this.healthGate;
    clearTimeout(gate?.window);
    clearTimeout(gate?.stable);
    this.healthGate = undefined;
    return gate;
  }

  private async acceptUpdate(note: string, level: 'info' | 'warn' = 'info'): Promise<void> {
    const gate = this.closeHealthGate();
    if (!gate) {
      return;
    }

    this.cli.logger(`camera.ui ${gate.to} ${note}, removing the backup of ${gate.from}`, level);
    await rm(this.serverBackupPath, { recursive: true, force: true }).catch((error) =>
      this.cli.logger(`Could not remove the backup of ${gate.from}: ${error.message}`, 'warn'),
    );
    await this.writeUpdateState({ target: gate.to, from: gate.from, result: 'applied', at: Date.now() });
  }

  private async rollBack(gate: HealthGate): Promise<void> {
    if (!existsSync(this.serverBackupPath)) {
      this.closeHealthGate();
      this.cli.logger(`camera.ui ${gate.to} keeps crashing, but the backup of ${gate.from} is gone`, 'fail');
      return;
    }

    const reason = `crashed ${gate.crashes} times before it reported healthy, last with ${gate.lastCrash}`;
    this.cli.logger(`camera.ui ${gate.to} ${reason}, rolling back to ${gate.from}`, 'warn');

    // leftovers of the failed version may still hold files in it open
    await this.reapLeftovers();

    this.closeHealthGate();

    const failedModules = `${this.serverModulesPath}.failed`;
    try {
      rmSync(failedModules, { recursive: true, force: true });
      renameSync(this.serverModulesPath, failedModules);
      try {
        renameSync(this.serverBackupPath, this.serverModulesPath);
      } catch (error) {
        renameSync(failedModules, this.serverModulesPath);
        throw error;
      }
    } catch (error) {
      this.cli.logger(`Could not roll back to ${gate.from}: ${error.message}`, 'fail');
      return;
    }

    this.writeState();
    this.rolledBack = { type: 'ROLLED_BACK', from: gate.to, to: gate.from, reason };
    await this.writeUpdateState({ target: gate.to, from: gate.from, result: 'rolled-back', reason, at: Date.now() });
    await rm(failedModules, { recursive: true, force: true }).catch(() => {});
  }

  private async stageInstall(version: string, stdout?: boolean): Promise<void> {
    if (IS_DEV) {
      throw new Error('npm install is disabled in development mode');
    }

    const stagingPath = join(this.serverPath, '.staging');
    const stagedModules = join(stagingPath, 'node_modules');

    // a fresh home has no folder for the lock yet
    await mkdir(this.serverPath, { recursive: true });
    await this.cli.chownPath(this.serverPath);
    this.acquireUpdateLock();

    try {
      rmSync(stagingPath, { recursive: true, force: true });
      await mkdir(stagingPath, { recursive: true });
      const seeded = await this.seedAllowScripts(stagingPath, version);
      await this.cli.chownPath(stagingPath);

      try {
        await this.npmInstallWithRetry(stagingPath, version, stdout, !seeded);

        if (!this.isStagedInstallComplete()) {
          throw new Error('Server install verification failed, staged files incomplete');
        }

        await this.cli.chownPath(stagedModules);
      } catch (error) {
        rmSync(stagingPath, { recursive: true, force: true });
        throw error;
      }
    } finally {
      this.releaseUpdateLock();
    }
  }

  private get updateLockPath(): string {
    return join(this.serverPath, '.staging.lock');
  }

  private acquireUpdateLock(): void {
    let cause: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        writeFileSync(this.updateLockPath, UPDATE_LOCK_OWNER, { flag: 'wx' });
        return;
      } catch (error) {
        cause = error;
        const holder = this.updateLockHolder();
        if (holder !== undefined) {
          throw new Error(`Another update is already in progress (pid ${holder})`);
        }
        rmSync(this.updateLockPath, { force: true });
      }
    }
    throw new Error(`Could not acquire the update lock: ${(cause as Error)?.message ?? cause}`);
  }

  private releaseUpdateLock(): void {
    try {
      if (readFileSync(this.updateLockPath, 'utf-8').trim() === UPDATE_LOCK_OWNER) {
        rmSync(this.updateLockPath, { force: true });
      }
    } catch {
      // already gone
    }
  }

  private updateLockHolder(): number | undefined {
    let owner: string;
    try {
      owner = readFileSync(this.updateLockPath, 'utf-8').trim();
    } catch {
      return undefined;
    }
    const pid = parseInt(owner, 10);
    if (!Number.isFinite(pid) || pid <= 0) {
      return undefined;
    }
    // a container restart hands the launcher its old pid again, only this very process still holds it
    if (pid === process.pid) {
      return owner === UPDATE_LOCK_OWNER ? pid : undefined;
    }
    try {
      process.kill(pid, 0);
      return pid;
    } catch (error) {
      // EPERM: alive, just not ours to signal
      return (error as NodeJS.ErrnoException).code === 'EPERM' ? pid : undefined;
    }
  }

  private isStagedInstallComplete(): boolean {
    const stagedModules = join(this.serverPath, '.staging', 'node_modules');
    return existsSync(join(stagedModules, APP_SERVER_NAME, 'package.json')) && existsSync(join(stagedModules, this.binDir, this.serverBinName));
  }

  private async finalizeStagedInstall(): Promise<void> {
    const stagingPath = join(this.serverPath, '.staging');
    const stagedModules = join(stagingPath, 'node_modules');

    if (!existsSync(stagingPath)) {
      return;
    }

    if (this.updateLockHolder() !== undefined) {
      return;
    }

    if (!this.isStagedInstallComplete()) {
      rmSync(stagingPath, { recursive: true, force: true });
      return;
    }

    const backupModules = this.serverBackupPath;
    const from = this.installedVersion(this.serverModulesPath);
    const target = this.installedVersion(stagedModules) ?? 'unknown';

    try {
      rmSync(backupModules, { recursive: true, force: true });
      const hadLive = existsSync(this.serverModulesPath);
      if (hadLive) {
        renameSync(this.serverModulesPath, backupModules);
      }

      try {
        renameSync(stagedModules, this.serverModulesPath);
      } catch (error) {
        if (hadLive && !existsSync(this.serverModulesPath)) {
          renameSync(backupModules, this.serverModulesPath);
        }
        throw error;
      }

      if (!from) {
        rmSync(backupModules, { recursive: true, force: true });
      }
      rmSync(stagingPath, { recursive: true, force: true });
      this.writeState();
      this.cli.logger('Staged server update applied', 'info');
    } catch (error) {
      // keep the staging dir, the swap is retried on the next start
      this.cli.logger(`Could not apply staged server update: ${error.message}`, 'warn');
      if (from) {
        await this.writeUpdateState({ target, from, result: 'swap-failed', reason: error.message, at: Date.now() });
      }
      return;
    }

    if (from) {
      await this.armHealthGate(from, target);
    }
  }

  private async seedAllowScripts(prefix: string, version: string): Promise<boolean> {
    const policy = await this.fetchAllowScripts(version);
    if (!policy) {
      return false;
    }

    writeFileSync(join(prefix, 'package.json'), JSON.stringify({ private: true, allowScripts: policy }, null, 2) + '\n');
    return true;
  }

  private fetchAllowScripts(version: string): Promise<Record<string, boolean> | undefined> {
    return new Promise((resolve) => {
      const npmCli = npmCommand();
      const args = [...npmCli.args, 'view', `${APP_SERVER_NAME}@${version}`, 'allowScripts', '--json', '--loglevel', 'silent'];

      const npm = spawn(npmCli.command, args, {
        uid: this.cli.allowRunRoot && this.cli.uid ? this.cli.uid : undefined,
        gid: this.cli.allowRunRoot && this.cli.gid ? this.cli.gid : undefined,
        env: process.env,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 30_000,
      });

      let out = '';
      npm.stdout?.on('data', (chunk) => (out += chunk));
      npm.on('error', () => resolve(undefined));
      npm.on('close', (code) => {
        if (code !== 0) {
          return resolve(undefined);
        }
        try {
          const parsed = JSON.parse(out || 'null');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const entries = Object.entries(parsed).filter(([, value]) => typeof value === 'boolean');
            if (entries.length > 0) {
              return resolve(Object.fromEntries(entries) as Record<string, boolean>);
            }
          }
        } catch {
          // fall through to the bypass flag
        }
        resolve(undefined);
      });
    });
  }

  private async npmInstallWithRetry(prefix: string, version: string, stdout?: boolean, allowAllScripts?: boolean): Promise<void> {
    const MAX_ATTEMPTS = 3;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await this.runNpmInstall(prefix, version, stdout, allowAllScripts);
        return;
      } catch (error) {
        lastError = error as Error;
        if (attempt >= MAX_ATTEMPTS || !isNetworkError(lastError)) {
          break;
        }
        this.cli.logger(`Server install attempt ${attempt}/${MAX_ATTEMPTS} failed (network); retrying…`, 'warn');
        await new Promise((r) => setTimeout(r, attempt * 3000));
      }
    }

    throw lastError ?? new Error('npm install failed');
  }

  private runNpmInstall(prefix: string, version: string, stdout?: boolean, allowAllScripts?: boolean): Promise<void> {
    if (stdout) {
      process.stdout.write('\n');
    }

    return new Promise<void>((resolve, reject) => {
      const npmCli = npmCommand();

      const env = {
        ...process.env,
        FORCE_COLOR: '1',
        NPM_CONFIG_COLOR: 'always',
      };

      const args = [
        ...npmCli.args,
        'install',
        `${APP_SERVER_NAME}@${version}`,
        // only without an allowScripts policy, older npm just warns about the unknown flag
        ...(allowAllScripts ? ['--dangerously-allow-all-scripts'] : []),
        '--prefix',
        prefix,
        '--omit=dev',
        '--no-progress',
        '--loglevel',
        'verbose',
        '--fetch-retries=5',
        '--fetch-retry-mintimeout=10000',
        '--fetch-retry-maxtimeout=60000',
      ];

      const npm = spawn(npmCli.command, args, {
        uid: this.cli.allowRunRoot && this.cli.uid ? this.cli.uid : undefined,
        gid: this.cli.allowRunRoot && this.cli.gid ? this.cli.gid : undefined,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderrTail = '';

      if (stdout) {
        npm.stdout.pipe(process.stdout);
        npm.stderr.pipe(process.stderr);
        npm.stderr.on('data', (data) => {
          stderrTail = (stderrTail + data.toString()).slice(-4000);
        });
      } else {
        npm.stdout.on('data', (data) => {
          this.send({
            type: 'UPDATE_OUTPUT',
            data: data.toString(),
          });
        });

        npm.stderr.on('data', (data) => {
          stderrTail = (stderrTail + data.toString()).slice(-4000);
          this.send({
            type: 'UPDATE_ERROR',
            data: data.toString(),
          });
        });
      }

      npm.on('close', (code) => {
        if (stdout) {
          process.stdout.write('\n');
        }

        if (code === 0) {
          resolve();
        } else {
          const npmCode = /npm (?:error|ERR!) code (\w+)/.exec(stderrTail)?.[1];
          const message =
            npmCode === 'ENOSPC' ? 'npm install failed, the disk is full (ENOSPC)' : `npm install failed with code ${code}${npmCode ? ` (${npmCode})` : ''}`;
          const error = new Error(message) as Error & { stderr?: string };
          error.stderr = stderrTail;
          reject(error);
        }
      });

      npm.on('error', reject);
    });
  }

  private send(message: CLIMessage): void {
    this.forkedProcess?.send?.(message);
  }

  private readState(): { version?: string; nodeAbi?: string } {
    try {
      return JSON.parse(readFileSync(this.serverStatePath, 'utf8'));
    } catch {
      return {};
    }
  }

  private writeState(): void {
    const version = this.installedVersion(this.serverModulesPath) ?? 'latest';

    try {
      writeFileSync(this.serverStatePath, JSON.stringify({ version, nodeAbi: process.versions.modules }));
    } catch (error) {
      this.cli.logger(`Could not persist server install state: ${error.message}`, 'warn');
    }
  }

  private installedVersion(modulesPath: string): string | undefined {
    try {
      return JSON.parse(readFileSync(join(modulesPath, APP_SERVER_NAME, 'package.json'), 'utf8')).version;
    } catch {
      return undefined;
    }
  }

  private async writeUpdateState(state: UpdateState): Promise<void> {
    try {
      await writeFileAtomic(this.updateStatePath, JSON.stringify(state));
    } catch (error) {
      this.cli.logger(`Could not write the update result: ${error.message}`, 'warn');
    }
  }
}
