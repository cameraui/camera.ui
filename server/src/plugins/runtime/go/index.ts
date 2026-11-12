import { spawn } from 'node:child_process';
import { chmodSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arch, platform } from 'node:os';
import { dirname, join } from 'node:path';

import { isMusl } from '../../../utils/platform.js';
import { BasePluginRuntime } from '../base.js';

export class GoPluginRuntime extends BasePluginRuntime {
  public async start(signal?: AbortSignal, instanceId?: string): Promise<void> {
    if (this.isRunning()) {
      return;
    }
    signal?.throwIfAborted();

    return new Promise<void>((resolve, reject) => {
      this.logger.log(`Starting plugin: ${this.plugin.displayName} (${this.plugin.pluginName}.${this.plugin.info.installedVersion})...`);

      const binaryPath = this.resolveBinaryPath();
      const processNames = [this.plugin.pluginName, this.plugin.displayName];

      this.logger.debug(`Spawning Go plugin: ${binaryPath}`);

      const supervision = this.prepareSpawn(instanceId);
      const worker = spawn(binaryPath, processNames, {
        env: { ...this.processEnv(), ...this.getEnv() },
        cwd: this.plugin.mainPath,
        detached: supervision.detached,
        windowsHide: supervision.windowsHide,
      });

      this.attach(worker, supervision, { command: binaryPath, args: processNames, titles: processNames }, resolve, reject);
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
    const suffix = goos === 'linux' && isMusl() ? '-musl' : '';
    return `${goos}-${goarch}${suffix}`;
  }
}
