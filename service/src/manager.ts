import { APP_SERVER_NAME, getNpmPath, IS_DEV } from '@camera.ui/common';
import { mkdirp } from 'fs-extra/esm';
import { fork, spawn } from 'node:child_process';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { ForkOptions } from 'child_process';
import type { ChildProcess } from 'node:child_process';
import type { CameraUiCLI } from './cameraui.js';

// Server to CLI communication
interface UpdateMessage {
  type: 'UPDATE_SERVER';
  version?: string;
}

interface ErrorMessage {
  type: 'START_ERROR';
}

type ServerMessage = UpdateMessage | ErrorMessage;

// CLI to Server communication
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

interface RestartRequiredMessage {
  type: 'RESTART_REQUIRED';
}

type CLIMessage = UpdateStartedMessage | UpdateOutputMessage | UpdateErrorMessage | UpdateCompleteMessage | UpdateFailedMessage | RestartRequiredMessage;

function isNetworkError(error: unknown): boolean {
  const err = error as { message?: string; stderr?: string };
  const haystack = `${err.message ?? ''}\n${err.stderr ?? ''}`.toLowerCase();
  return /econnreset|etimedout|esockettimedout|eai_again|enotfound|econnrefused|socket hang up|epipe|network|aborted|fetch failed/.test(haystack);
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

  private get serverBinPath(): string {
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
      await mkdirp(this.serverPath);
      await this.cli.chownPath(this.serverPath);

      const backupModules = `${this.serverModulesPath}.bak`;
      if (!existsSync(this.serverModulesPath) && existsSync(backupModules)) {
        this.cli.logger('Restoring previous server install from backup (interrupted swap)', 'warn');
        renameSync(backupModules, this.serverModulesPath);
      }

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
        await this.npmInstall(state.version ?? 'latest', true);
        this.writeState();
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

    if (!existsSync(this.serverBinPath)) {
      throw new Error(`Server binary not found at: ${this.serverBinPath}`);
    }

    this.reset();

    const env = {
      ...process.env,
      FORCE_COLOR: '1',
    };

    const childProcessOpts: ForkOptions = {
      env,
      uid: this.cli.allowRunRoot && this.cli.uid ? this.cli.uid : undefined,
      gid: this.cli.allowRunRoot && this.cli.gid ? this.cli.gid : undefined,
      silent: true,
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
    this.onCloseHandler = onClose;
    this.forkedProcess.once('close', onClose);
  }

  public stop(): Promise<void> {
    const proc = this.forkedProcess;
    if (!proc) {
      this.reset();
      return Promise.resolve();
    }

    if (this.onCloseHandler) {
      proc.removeListener('close', this.onCloseHandler);
      this.onCloseHandler = undefined;
    }

    return new Promise<void>((resolve) => {
      const done = (): void => {
        clearTimeout(forceKill);
        this.reset();
        resolve();
      };

      proc.once('close', done);
      const forceKill = setTimeout(() => {
        this.cli.logger('camera.ui did not exit in time; sending SIGKILL', 'warn');
        proc.kill('SIGKILL');
      }, 8000);

      proc.kill();
    });
  }

  private reset(): void {
    this.forkedProcess?.removeAllListeners();
    this.forkedProcess?.stdout?.removeAllListeners();
    this.forkedProcess?.stderr?.removeAllListeners();
    this.forkedProcess?.stdout?.destroy();
    this.forkedProcess?.stderr?.destroy();
    this.forkedProcess = undefined;
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
      await this.npmInstall(version, stdout);

      if (!this.isServerHealthy()) {
        throw new Error('Server install verification failed — files incomplete after update');
      }

      this.writeState();

      this.send({
        type: 'UPDATE_COMPLETE',
        version: version,
      });

      this.cli.logger('Server update completed', 'succeed');
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
          this.send({ type: 'RESTART_REQUIRED' });
          break;
        }
        case 'START_ERROR': {
          this.serverCrashed = true;
          break;
        }
      }
    } catch (error) {
      this.send({ type: 'UPDATE_FAILED', error: error.message });
    }
  }

  private async npmInstall(version: string, stdout?: boolean): Promise<void> {
    if (IS_DEV) {
      throw new Error('npm install is disabled in development mode');
    }

    const stagingPath = join(this.serverPath, '.staging');
    const stagedModules = join(stagingPath, 'node_modules');
    const backupModules = `${this.serverModulesPath}.bak`;

    rmSync(stagingPath, { recursive: true, force: true });
    await mkdirp(stagingPath);
    await this.cli.chownPath(stagingPath);

    try {
      await this.npmInstallWithRetry(stagingPath, version, stdout);

      const staged = existsSync(join(stagedModules, APP_SERVER_NAME, 'package.json')) && existsSync(join(stagedModules, this.binDir, this.serverBinName));
      if (!staged) {
        throw new Error('Server install verification failed — staged files incomplete');
      }

      await this.cli.chownPath(stagedModules);
    } catch (error) {
      rmSync(stagingPath, { recursive: true, force: true });
      throw error;
    }

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
      rmSync(stagingPath, { recursive: true, force: true });
      throw error;
    }

    rmSync(backupModules, { recursive: true, force: true });
    rmSync(stagingPath, { recursive: true, force: true });
  }

  private async npmInstallWithRetry(prefix: string, version: string, stdout?: boolean): Promise<void> {
    const MAX_ATTEMPTS = 3;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await this.runNpmInstall(prefix, version, stdout);
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

  private runNpmInstall(prefix: string, version: string, stdout?: boolean): Promise<void> {
    if (stdout) {
      process.stdout.write('\n');
    }

    return new Promise<void>((resolve, reject) => {
      const npmPath = getNpmPath().join(' ');

      const env = {
        ...process.env,
        FORCE_COLOR: '1',
        NPM_CONFIG_COLOR: 'always',
      };

      const args = [
        'install',
        `${APP_SERVER_NAME}@${version}`,
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

      const npm = spawn(npmPath, args, {
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
          const error = new Error(`npm install failed with code ${code}`) as Error & { stderr?: string };
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
    let version = 'latest';
    try {
      const pkg = JSON.parse(readFileSync(join(this.serverModulesPath, APP_SERVER_NAME, 'package.json'), 'utf8'));
      version = pkg.version ?? version;
    } catch {
      // fall back to the tag if the installed package.json is unreadable
    }

    try {
      writeFileSync(this.serverStatePath, JSON.stringify({ version, nodeAbi: process.versions.modules }));
    } catch (error) {
      this.cli.logger(`Could not persist server install state: ${error.message}`, 'warn');
    }
  }
}
