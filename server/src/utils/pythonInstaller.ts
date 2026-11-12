import { ensureDir, remove } from 'fs-extra/esm';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { platform } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { createInterface } from 'node:readline';

import { killTree } from '@camera.ui/common/node';
import { IS_ELECTRON } from '@camera.ui/common/utils';

import { tryInject } from '../container.js';
import { StandalonePython } from './standalonePython.js';

import type { Logger } from '@camera.ui/common';
import type { PythonVersion } from '@camera.ui/sdk';
import type { ChildProcess } from 'node:child_process';

export const DEFAULT_PY_VERSION = '3.11';

const POSIX = process.platform !== 'win32';

export class PythonInstaller {
  static readonly versions: PythonVersion[] = ['3.12', '3.11'];

  readonly python: StandalonePython;
  readonly venvPath?: string;
  readonly installPath: string;

  private readonly pythonDir: string;
  private needsUpdate = false;
  private signal?: AbortSignal;

  get isInstalled(): boolean {
    return this.python.isInstalled();
  }

  get pluginPythonPath(): string {
    if (!this.venvPath) {
      throw new Error('Venv path is not defined');
    }

    const binPath = platform() === 'win32' ? 'Scripts' : 'bin';
    return join(this.venvPath, binPath, 'python');
  }

  get serverPythonPath(): string {
    return this.python.executablePath;
  }

  get pluginPackagesPath(): string {
    if (!this.venvPath) {
      throw new Error('Venv path is not defined');
    }

    if (platform() === 'win32') {
      return join(this.venvPath, 'Lib', 'site-packages');
    } else {
      return join(this.venvPath, 'lib', `python${this.getMajorMinorVersion(this.version)}`, 'site-packages');
    }
  }

  get serverPackagesPath(): string {
    if (platform() === 'win32') {
      return join(this.python.extractPath, 'Lib', 'site-packages');
    } else {
      return join(this.python.extractPath, 'lib', `python${this.getMajorMinorVersion(this.version)}`, 'site-packages');
    }
  }

  get version(): string {
    return this.python.version;
  }

  constructor(
    homePath: string,
    public logger: Logger,
    venvDir?: string,
    version: string = DEFAULT_PY_VERSION,
  ) {
    if (!PythonInstaller.versions.includes(version as PythonVersion)) {
      version = DEFAULT_PY_VERSION;
    }

    this.pythonDir = IS_ELECTRON ? 'python-electron' : 'python';
    this.installPath = `${homePath}/${this.pythonDir}`;
    this.python = new StandalonePython(version as PythonVersion, this.installPath);

    if (venvDir) {
      this.venvPath = join(venvDir, `${this.pythonDir}-${this.version}-${this.python.target}`);
    }
  }

  public async install(type: 'plugin' | 'server', requirementsPath?: string): Promise<void> {
    if (!this.isInstalled) {
      this.logger.trace(`Installing Python v${this.version} to ${this.installPath}...`);

      await ensureDir(this.installPath);
      await this.python.install();
      await this.removeOldVersions();
    }

    await this.ensureCertifi();

    if (type === 'server') {
      if (!requirementsPath) {
        throw new Error('Requirements path is not defined');
      }

      await this.updateServerDependencies(requirementsPath);
    }
  }

  public async installPluginPython(signal?: AbortSignal): Promise<void> {
    this.signal = signal;
    await this.install('plugin');
    await this.removeStaleVenvs();
    await this.createVenv();
  }

  public async uninstall(): Promise<void> {
    if (this.isInstalled) {
      await this.python.uninstall();
    }

    await this.removeVenv();
  }

  public async updatePluginDependencies(requirementsPath: string, signal?: AbortSignal): Promise<void> {
    this.signal = signal;
    await this.ensureVenv();

    const { needsUpdate, requirementsLockPath, requirementsContent, lockContent, updatedLockContent } = await this.updateRequirements(requirementsPath);
    const { reInstall, uninstall } = await this.analyzeDependencies(requirementsContent, lockContent, needsUpdate);

    await this.updateDependencies('plugin', requirementsPath, reInstall, uninstall);

    if (updatedLockContent) {
      await writeFile(requirementsLockPath, updatedLockContent);
    }
  }

  public async updateServerDependencies(requirementsPath: string): Promise<void> {
    const requirementsLockPath = join(this.python.extractPath, 'requirements-lock.txt');

    const { needsUpdate, requirementsContent, lockContent, updatedLockContent } = await this.updateRequirements(requirementsPath, requirementsLockPath);
    const { reInstall, uninstall } = await this.analyzeDependencies(requirementsContent, lockContent, needsUpdate);

    await this.updateDependencies('server', requirementsPath, reInstall, uninstall);

    if (updatedLockContent) {
      await writeFile(requirementsLockPath, updatedLockContent);
    }
  }

  public async installPluginPackages(pkgs: string[]): Promise<string> {
    await this.ensureVenv();
    return this.installPackages(this.pluginPythonPath, pkgs);
  }

  public async installServerPackages(pkgs: string[]): Promise<string> {
    return this.installPackages(this.serverPythonPath, pkgs);
  }

  public async reinstallPluginPackes(pkgs: string[]): Promise<string> {
    await this.ensureVenv();
    return this.reinstallPackages(this.pluginPythonPath, pkgs);
  }

  public async reinstallServerPackages(pkgs: string[]): Promise<string> {
    return this.reinstallPackages(this.serverPythonPath, pkgs);
  }

  public async uninstallPluginPackages(pkgs: string[]): Promise<string> {
    await this.ensureVenv();
    return this.uninstallPackages(this.pluginPythonPath, pkgs);
  }

  public async uninstallServerPackages(pkgs: string[]): Promise<string> {
    return this.uninstallPackages(this.serverPythonPath, pkgs);
  }

  private async installPluginRequirements(requirementsPath: string): Promise<string> {
    return this.installRequirements(this.pluginPythonPath, requirementsPath);
  }

  private async installServerRequirements(requirementsPath: string): Promise<string> {
    return this.installRequirements(this.serverPythonPath, requirementsPath);
  }

  private async ensureVirtualenv(): Promise<void> {
    if (existsSync(join(this.serverPackagesPath, 'virtualenv'))) {
      return;
    }

    await this.installServerPackages(['virtualenv']);
  }

  private async ensureCertifi(): Promise<void> {
    if (existsSync(join(this.serverPackagesPath, 'certifi', 'cacert.pem'))) {
      return;
    }

    try {
      await this.installServerPackages(['certifi']);
    } catch (error) {
      this.logger.warn(`Failed to install certifi into the base Python, plugins may fail TLS to external hosts: ${(error as Error).message}`);
    }
  }

  private async updateRequirements(
    requirementsPath: string,
    requirementsLockPath?: string,
  ): Promise<{ needsUpdate: boolean; requirementsLockPath: string; requirementsContent: string; lockContent?: string; updatedLockContent?: string }> {
    requirementsLockPath = requirementsLockPath ?? join(dirname(requirementsPath), 'requirements-lock.txt');
    const requirementsContent = await readFile(requirementsPath, 'utf8');

    let lockContent: string | undefined;
    let updatedLockContent: string | undefined;

    let requirementsLockContent = '';
    let lockPythonVersion = '';

    try {
      lockContent = await readFile(requirementsLockPath, 'utf8');
      const lockLines = lockContent.split('\n');
      lockPythonVersion = lockLines[0].replace('# Python version: ', '').trim();
      requirementsLockContent = lockLines.slice(1).join('\n');
    } catch {
      // ignore
    }

    const currentPythonVersion = this.version;

    const needsUpdate = requirementsContent !== requirementsLockContent || currentPythonVersion !== lockPythonVersion;

    if (needsUpdate) {
      updatedLockContent = `# Python version: ${currentPythonVersion}\n${requirementsContent}`;
    }

    return { needsUpdate, requirementsLockPath, requirementsContent, lockContent, updatedLockContent };
  }

  private async analyzeDependencies(reqContent: string, reqLockContent?: string, needsUpdate?: boolean): Promise<{ reInstall: string[]; uninstall: string[] }> {
    const requiredPackages = new Set<string>(
      reqContent
        .split('\n')
        .filter((line) => /^[a-zA-Z]/.test(line))
        .map((line) => this.cleanPackageName(line))
        .filter((line) => line !== ''),
    );

    let oldPackeges = new Set<string>();
    if (reqLockContent) {
      oldPackeges = new Set<string>(
        reqLockContent
          .split('\n')
          .filter((line) => /^[a-zA-Z]/.test(line))
          .map((line) => this.cleanPackageName(line))
          .filter((line) => line !== ''),
      );
    }

    const toReinstall: string[] = [];
    const toUninstall: string[] = [...this.difference(oldPackeges, requiredPackages)];

    if (needsUpdate || this.needsUpdate) {
      toReinstall.push(...requiredPackages);
    } else {
      toReinstall.push(...this.difference(requiredPackages, oldPackeges));
    }

    return { reInstall: toReinstall, uninstall: toUninstall };
  }

  private async updateDependencies(type: 'server' | 'plugin', requirementsPath: string, reInstall: string[] = [], uninstall: string[] = []): Promise<void> {
    if (uninstall.length > 0) {
      this.logger.trace(`Uninstalling ${type} packages: ${uninstall.join(', ')}`);

      if (type === 'plugin') {
        await this.uninstallPluginPackages(uninstall);
      } else {
        await this.uninstallServerPackages(uninstall);
      }
    }

    if (reInstall.length > 0) {
      this.logger.trace(`Installing ${type} requirements...`);

      if (type === 'plugin') {
        await this.installPluginRequirements(requirementsPath);
      } else {
        await this.installServerRequirements(requirementsPath);
      }
    } else {
      this.logger.trace(`Dependencies for ${type} are up to date`);
    }
  }

  private async installRequirements(pythonPath: string, requirementsPath: string): Promise<string> {
    const args = [this.quotePath(pythonPath), '-m', 'pip', 'install', '--upgrade', 'pip', '-r', this.quotePath(requirementsPath)];

    if ((process.env.SUDO_UID && process.env.SUDO_GID) || process.getuid?.() === 0) {
      args.push('--root-user-action=ignore');
    }

    args.push('--use-pep517', '--no-warn-script-location');

    const command = args.join(' ');
    this.logger.trace(`Installing requirements command: ${command}`);

    const child = this.run(command, pythonPath, { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' }, pythonPath !== this.serverPythonPath);

    const stdoutLine = createInterface({
      input: child.stdout!,
      terminal: false,
    });

    const stderrLine = createInterface({
      input: child.stderr!,
      terminal: false,
    });

    stdoutLine.on('line', (line: string) => {
      this.logger.trace(line);
    });

    stderrLine.on('line', (line: string) => {
      this.logger.error(line);
    });

    return new Promise((_resolve, _reject) => {
      child.on('close', (code) => {
        stdoutLine.close();
        stderrLine.close();

        if (code === 0) {
          _resolve('Requirements installed');
        } else {
          _reject(new Error(`Installation process exited with code ${code}`));
        }
      });
    });
  }

  private async installPackages(pythonPath: string, pkgs: string[]): Promise<string> {
    if (pkgs.length === 0) return Promise.resolve('');

    const args = [this.quotePath(pythonPath), '-m', 'pip', 'install', '--upgrade', 'pip'];
    args.push(...pkgs.map((pkg) => (pkg.includes(' ') ? this.quotePath(pkg) : pkg)));

    if ((process.env.SUDO_UID && process.env.SUDO_GID) || process.getuid?.() === 0) {
      args.push('--root-user-action=ignore');
    }

    args.push('--use-pep517', '--no-warn-script-location');

    const command = args.join(' ');
    this.logger.trace(`Installing packages command: ${command}`);

    const child = this.run(command, pythonPath, { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' }, pythonPath !== this.serverPythonPath);

    const stdoutLine = createInterface({
      input: child.stdout!,
      terminal: false,
    });

    const stderrLine = createInterface({
      input: child.stderr!,
      terminal: false,
    });

    stdoutLine.on('line', (line: string) => {
      this.logger.trace(line);
    });

    stderrLine.on('line', (line: string) => {
      this.logger.error(line);
    });

    return new Promise((_resolve, _reject) => {
      child.on('close', (code) => {
        stdoutLine.close();
        stderrLine.close();

        if (code === 0) {
          _resolve('Packages installed');
        } else {
          _reject(new Error(`Installation process exited with code ${code}`));
        }
      });
    });
  }

  private async uninstallPackages(pythonPath: string, pkgs: string[]): Promise<string> {
    if (pkgs.length === 0) return Promise.resolve('');

    const args = [this.quotePath(pythonPath), '-m', 'pip', 'uninstall', '-y'];
    args.push(...pkgs.map((pkg) => (pkg.includes(' ') ? this.quotePath(pkg) : pkg)));

    if ((process.env.SUDO_UID && process.env.SUDO_GID) || process.getuid?.() === 0) {
      args.push('--root-user-action=ignore');
    }

    const command = args.join(' ');
    this.logger.trace(`Uninstalling packages command: ${command}`);

    const child = this.run(command, pythonPath, { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' }, pythonPath !== this.serverPythonPath);

    const stdoutLine = createInterface({
      input: child.stdout!,
      terminal: false,
    });

    const stderrLine = createInterface({
      input: child.stderr!,
      terminal: false,
    });

    stdoutLine.on('line', (line: string) => {
      this.logger.trace(line);
    });

    stderrLine.on('line', (line: string) => {
      this.logger.error(line);
    });

    return new Promise((_resolve, _reject) => {
      child.on('close', (code) => {
        stdoutLine.close();
        stderrLine.close();

        if (code === 0) {
          _resolve('Packages uninstalled');
        } else {
          _reject(new Error(`Installation process exited with code ${code}`));
        }
      });
    });
  }

  private async reinstallPackages(pythonPath: string, pkgs: string[]): Promise<string> {
    if (pkgs.length === 0) return Promise.resolve('');

    const args = [this.quotePath(pythonPath), '-m', 'pip', 'install', '--force-reinstall'];
    args.push(...pkgs.map((pkg) => (pkg.includes(' ') ? this.quotePath(pkg) : pkg)));

    if ((process.env.SUDO_UID && process.env.SUDO_GID) || process.getuid?.() === 0) {
      args.push('--root-user-action=ignore');
    }

    args.push('--use-pep517', '--no-warn-script-location');

    const command = args.join(' ');
    this.logger.trace(`Reinstalling packages command: ${command}`);

    const child = this.run(command, pythonPath, { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' }, pythonPath !== this.serverPythonPath);

    const stdoutLine = createInterface({
      input: child.stdout!,
      terminal: false,
    });

    const stderrLine = createInterface({
      input: child.stderr!,
      terminal: false,
    });

    stdoutLine.on('line', (line: string) => {
      this.logger.trace(line);
    });

    stderrLine.on('line', (line: string) => {
      this.logger.error(line);
    });

    return new Promise((_resolve, _reject) => {
      child.on('close', (code) => {
        stdoutLine.close();
        stderrLine.close();

        if (code === 0) {
          _resolve('Packages reinstalled');
        } else {
          _reject(new Error(`Installation process exited with code ${code}`));
        }
      });
    });
  }

  private async ensureVenv(): Promise<void> {
    if (!this.venvPath) {
      throw new Error('Venv path is not defined');
    }

    if (!existsSync(this.venvPath)) {
      await this.createVenv();
      await this.removeStaleVenvs();
    }
  }

  private async removeStaleVenvs(): Promise<void> {
    const parent = dirname(this.venvPath!);
    const current = basename(this.venvPath!);
    const ownVenv = new RegExp(`^${this.pythonDir}-\\d+\\.\\d+`);

    const entries = await readdir(parent, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === current || !ownVenv.test(entry.name)) {
        continue;
      }

      this.logger.trace(`Removing stale venv: ${entry.name}`);
      await remove(join(parent, entry.name));
    }
  }

  private async createVenv(): Promise<void> {
    if (!this.venvPath) {
      throw new Error('Venv path is not defined');
    }

    if (existsSync(this.venvPath)) {
      return;
    }

    this.needsUpdate = true;

    await this.ensureVirtualenv();

    const args = [this.quotePath(this.serverPythonPath), '-m', 'virtualenv', this.quotePath(this.venvPath)];

    const command = args.join(' ');
    this.logger.trace(`Creating venv using virtualenv: ${command}`);

    const child = this.run(command, this.serverPythonPath, { ...process.env, VIRTUALENV_PYTHON: this.serverPythonPath }, true);

    const stdoutLine = createInterface({
      input: child.stdout!,
      terminal: false,
    });

    const stderrLine = createInterface({
      input: child.stderr!,
      terminal: false,
    });

    stdoutLine.on('line', (line: string) => {
      this.logger.trace(line);
    });

    stderrLine.on('line', (line: string) => {
      this.logger.error(line);
    });

    return new Promise((_resolve, _reject) => {
      child.on('close', (code) => {
        stdoutLine.close();
        stderrLine.close();

        if (code === 0) {
          _resolve();
        } else {
          // a half-built venv would count as present on the next start
          rm(this.venvPath!, { recursive: true, force: true }).finally(() => _reject(new Error(`Virtualenv creation process exited with code ${code}`)));
        }
      });
    });
  }

  private run(command: string, python: string, env: NodeJS.ProcessEnv, abortable: boolean): ChildProcess {
    const child = spawn(command, { shell: true, env, detached: POSIX, windowsHide: true });
    const pid = child.pid;
    if (!pid) {
      return child;
    }

    const entry = { pid, pgid: POSIX ? pid : undefined };
    const configService = tryInject('configService');
    configService?.addProcess({ ...entry, startTime: Date.now(), command: python, args: [], role: 'provision' });

    // an install interrupted on the shared base python would break every plugin
    const signal = abortable ? this.signal : undefined;
    const abort = () => killTree(entry).catch(() => {});
    signal?.addEventListener('abort', abort, { once: true });
    child.once('exit', () => {
      signal?.removeEventListener('abort', abort);
      configService?.removeProcessByPID(pid);
    });
    if (signal?.aborted) {
      abort();
    }

    return child;
  }

  private async removeVenv(): Promise<void> {
    if (!this.venvPath) {
      throw new Error('Venv path is not defined');
    }

    await rm(this.venvPath, { recursive: true, force: true });

    const parentDirectory = dirname(this.venvPath);
    const directories = await readdir(parentDirectory, { withFileTypes: true });

    const pythonDirs = directories.filter((dirent) => dirent.isDirectory() && dirent.name.startsWith('python-')).map((dirent) => join(parentDirectory, dirent.name));

    for (const dir of pythonDirs) {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async removeOldVersions(): Promise<void> {
    const current = basename(this.python.extractPath);
    const currentMinor = this.getMajorMinorVersion(this.version);
    const entries = await readdir(this.installPath, { withFileTypes: true });

    for (const entry of entries) {
      const version = /^(?:cpython|python(?:-headless)?)-(\d+\.\d+\.\d+)/.exec(entry.name)?.[1];
      if (!entry.isDirectory() || !version || entry.name === current) {
        continue;
      }

      const minor = this.getMajorMinorVersion(version);
      if (minor !== currentMinor && PythonInstaller.versions.includes(minor as PythonVersion)) {
        continue;
      }

      this.logger.trace(`Removing old Python build: ${entry.name}`);

      await remove(join(this.installPath, entry.name));
      await remove(join(this.installPath, `requirements-lock-${version}.txt`));
    }
  }

  private getMajorMinorVersion(version: string): string {
    const match = /^(\d+)(?:\.(\d+))?/.exec(version);
    if (match) {
      const major = match[1];
      const minor = match[2] || '';
      return minor ? `${major}.${minor}` : major;
    }
    return '';
  }

  private cleanPackageName(line: string): string {
    const regex = /^([a-zA-Z0-9_-]+)/;
    const match = regex.exec(line);
    return match ? match[1] : '';
  }

  private difference(setA: Set<string>, setB: Set<string>): Set<string> {
    return new Set([...setA].filter((x) => !setB.has(x)));
  }

  private quotePath(path: string): string {
    return platform() === 'win32' ? `"${path.replace(/"/g, '\\"')}"` : `'${path.replace(/'/g, "\\'")}'`;
  }
}
