import { execSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arch, platform } from 'node:os';
import { dirname, join } from 'node:path';

import { BasePluginRuntime } from '../base.js';

export class GoPluginRuntime extends BasePluginRuntime {
  public async start(): Promise<void> {
    if (this.isRunning()) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      this.logger.log(`Starting plugin: ${this.plugin.displayName} (${this.plugin.pluginName}.${this.plugin.info.installedVersion})...`);

      const binaryPath = this.resolveBinaryPath();
      const processNames = [this.plugin.pluginName, this.plugin.displayName];

      this.logger.debug(`Spawning Go plugin: ${binaryPath}`);

      this.worker = spawn(binaryPath, processNames, {
        env: this.getEnv(),
        cwd: this.plugin.mainPath,
        windowsHide: true,
      });

      this.worker.on('spawn', this.onSpawn.bind(this, this.worker.pid!, binaryPath, processNames, processNames, resolve));
      this.worker.on('error', this.onError.bind(this, reject));
      this.worker.on('exit', this.onExit.bind(this));

      this.worker.stdout?.on('data', this.onData.bind(this));
      this.worker.stderr?.on('data', this.onData.bind(this));
    });
  }

  private resolveBinaryPath(): string {
    const ext = platform() === 'win32' ? '.exe' : '';

    const devBinaryPath = join(this.plugin.mainPath, 'dist', 'bin', `plugin${ext}`);
    if (existsSync(devBinaryPath)) {
      if (ext === '') {
        try {
          chmodSync(devBinaryPath, 0o755);
        } catch {
          // ignore
        }
      }
      return devBinaryPath;
    }

    const name = this.plugin.pluginName;
    const scope = name.includes('/') ? name.split('/')[0] : undefined;
    const base = name.replace(/^@[^/]+\//, '');
    const key = this.platformKey();
    const platformPkg = scope ? `${scope}/${base}-${key}` : `${base}-${key}`;

    let binaryPath: string;
    try {
      const req = createRequire(join(this.plugin.installPath, 'package.json'));
      const pkgDir = dirname(req.resolve(`${platformPkg}/package.json`));
      binaryPath = join(pkgDir, `${base}${ext}`);
    } catch {
      throw new Error(`Go binary not found: platform package "${platformPkg}" is not installed (unsupported platform "${key}"?).`);
    }

    if (!existsSync(binaryPath)) {
      throw new Error(`Go binary missing inside platform package "${platformPkg}": ${binaryPath}`);
    }

    if (ext === '') {
      try {
        chmodSync(binaryPath, 0o755);
      } catch {
        // ignore
      }
    }

    return binaryPath;
  }

  private platformKey(): string {
    const goos = platform() === 'win32' ? 'windows' : platform();
    const goarch = arch() === 'x64' ? 'amd64' : arch();
    const suffix = goos === 'linux' && this.isMusl() ? '-musl' : '';
    return `${goos}-${goarch}${suffix}`;
  }

  private isMusl(): boolean {
    if (platform() !== 'linux') {
      return false;
    }

    try {
      const report = (process.report?.getReport?.() ?? undefined) as { header?: { glibcVersionRuntime?: string }; sharedObjects?: string[] } | undefined;
      if (report?.header?.glibcVersionRuntime) {
        return false;
      }
      if (Array.isArray(report?.sharedObjects) && report.sharedObjects.some((f) => f.includes('libc.musl-') || f.includes('ld-musl-'))) {
        return true;
      }
    } catch {
      // fall through to the ldd-based checks
    }

    try {
      if (readFileSync('/usr/bin/ldd', 'utf-8').includes('musl')) {
        return true;
      }
    } catch {
      // /usr/bin/ldd may not exist — try invoking ldd directly
    }

    try {
      if (execSync('ldd --version 2>&1', { encoding: 'utf-8' }).includes('musl')) {
        return true;
      }
    } catch {
      // give up — assume glibc
    }

    return false;
  }
}
