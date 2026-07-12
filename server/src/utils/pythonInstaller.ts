import { PortablePython } from '@bjia56/portable-python';
import { compareVersions } from 'compare-versions';
import { copy, ensureDir, remove } from 'fs-extra/esm';
import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { platform } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

import { IS_ELECTRON } from '@camera.ui/common/utils';

import type { Logger } from '@camera.ui/common';
import type { PythonVersion } from '@camera.ui/sdk';

export const DEFAULT_PY_VERSION = '3.11';

export class PythonInstaller {
  static readonly versions: PythonVersion[] = ['3.12', '3.11'];

  readonly python: PortablePython;
  readonly venvPath?: string;
  readonly installPath: string;

  private readonly pythonDir: string;
  private needsUpdate = false;

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
    this.python = new PortablePython(version, this.installPath);

    if (venvDir) {
      this.venvPath = join(venvDir, `${this.pythonDir}-${this.getMajorMinorVersion(this.version)}-${process.platform}-${process.arch}`);
    }
  }

  public async install(type: 'plugin' | 'server', requirementsPath?: string): Promise<void> {
    if (!this.isInstalled) {
      this.logger.trace(`Installing Python v${this.version} to ${this.installPath}...`);

      await ensureDir(this.installPath);
      await this.removeOldVersions();
      await this.python.install();
    }

    await this.ensureCertifi();

    if (type === 'server') {
      if (!requirementsPath) {
        throw new Error('Requirements path is not defined');
      }

      await this.updateServerDependencies(requirementsPath);

      if (platform() === 'win32') {
        const binPath = dirname(this.serverPythonPath);
        const pythonwPath = join(binPath, 'pythonw.exe');

        if (!existsSync(pythonwPath)) {
          await copy(this.serverPythonPath, pythonwPath);
        }
      }
    }
  }

  public async installPluginPython(): Promise<void> {
    await this.install('plugin');
    await this.cleanStaleVenvs();
    await this.createVenv();
  }

  public async uninstall(): Promise<void> {
    if (this.isInstalled) {
      await this.python.uninstall();
    }

    await this.removeVenv();
  }

  public async updatePluginDependencies(requirementsPath: string): Promise<void> {
    await this.ensureVenv();

    const { needsUpdate, requirementsLockPath, requirementsContent, lockContent, updatedLockContent } = await this.updateRequirements(requirementsPath);
    const { reInstall, uninstall } = await this.analyzeDependencies(requirementsContent, lockContent, needsUpdate);

    await this.updateDependencies('plugin', requirementsPath, reInstall, uninstall);

    if (updatedLockContent) {
      await writeFile(requirementsLockPath, updatedLockContent);
    }
  }

  public async updateServerDependencies(requirementsPath: string): Promise<void> {
    const requirementsLockPath = resolve(join(this.installPath, `requirements-lock-${this.version}.txt`));

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

  private async ensureCertifi(): Promise<void> {
    if (existsSync(join(this.serverPackagesPath, 'certifi', 'cacert.pem'))) {
      return;
    }

    try {
      await this.installServerPackages(['certifi']);
    } catch (error) {
      this.logger.warn(`Failed to install certifi into the base Python — plugins may fail TLS to external hosts: ${(error as Error).message}`);
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
      //
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

    args.push('--use-pep517');

    const command = args.join(' ');
    this.logger.trace(`Installing requirements command: ${command}`);

    const child = exec(command, { env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' } });

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

    args.push('--use-pep517');

    const command = args.join(' ');
    this.logger.trace(`Installing packages command: ${command}`);

    const child = exec(command, { env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' } });

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

    const child = exec(command, { env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' } });

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

    args.push('--use-pep517');

    const command = args.join(' ');
    this.logger.trace(`Reinstalling packages command: ${command}`);

    const child = exec(command, { env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' } });

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

    const args = [this.quotePath(this.serverPythonPath), '-m', 'virtualenv', this.quotePath(this.venvPath)];

    const command = args.join(' ');
    this.logger.trace(`Creating venv using virtualenv: ${command}`);

    const child = exec(command, { env: { ...process.env, VIRTUALENV_PYTHON: this.serverPythonPath } });

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
          _reject(new Error(`Virtualenv creation process exited with code ${code}`));
        }
      });
    });
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

  private async cleanStaleVenvs(): Promise<void> {
    if (!this.venvPath) {
      return;
    }

    const parent = dirname(this.venvPath);
    const current = basename(this.venvPath);
    const pattern = new RegExp(`^${this.pythonDir}-\\d+\\.\\d+`);

    let entries;
    try {
      entries = await readdir(parent, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === current || !pattern.test(entry.name)) {
        continue;
      }

      this.logger.trace(`Removing stale venv (arch/version mismatch): ${entry.name}`);
      await rm(join(parent, entry.name), { recursive: true, force: true });
    }
  }

  private async removeOldVersions(): Promise<void> {
    const currentVersion = this.version;
    const pythonDirs = await readdir(this.installPath);

    for (const dir of pythonDirs) {
      const match = /^python-(\d+\.\d+(?:\.\d+)?)(.*)$/.exec(dir);

      if (match) {
        const version = match[1];
        const platformSuffix = match[2];

        if (compareVersions(version, currentVersion) === -1) {
          const fullPath = join(this.installPath, `python-${version}${platformSuffix}`);
          const requirementsLockPath = join(this.installPath, `requirements-lock-${version}.txt`);

          this.logger.trace(`Removing old Python version: ${version}`);

          await remove(fullPath);
          await remove(requirementsLockPath);
        }
      }
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
