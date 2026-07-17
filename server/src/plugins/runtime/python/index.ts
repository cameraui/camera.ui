import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { platform } from 'node:os';
import { join } from 'node:path';

import { pythonPath, pythonPluginPath, serverRequirementsPath } from '../../../utils/path.js';
import { DEFAULT_PY_VERSION, PythonInstaller } from '../../../utils/pythonInstaller.js';
import { BasePluginRuntime } from '../base.js';

import type { RuntimePlugin } from '../base.js';

const serverEnvInstalls = new Map<string, Promise<void>>();

function installWorkerServerEnv(py: PythonInstaller): Promise<void> {
  const key = py.serverPythonPath;

  let install = serverEnvInstalls.get(key);
  if (!install) {
    install = py.install('server', serverRequirementsPath).catch((error) => {
      serverEnvInstalls.delete(key);
      throw error;
    });
    serverEnvInstalls.set(key, install);
  }

  return install;
}

export class PythonPluginRuntime extends BasePluginRuntime {
  private py: PythonInstaller;

  constructor(plugin: RuntimePlugin) {
    super(plugin);

    this.py = new PythonInstaller(this.configService.HOME_PATH, this.logger, this.plugin.installPath, this.plugin.contract.pythonVersion);
  }

  public async start(): Promise<void> {
    if (this.isRunning()) {
      return;
    }

    await this.updatePython();

    return new Promise<void>((resolve, reject) => {
      this.logger.log(`Starting plugin: ${this.plugin.displayName} (${this.plugin.pluginName}.${this.plugin.info.installedVersion})...`);

      const command = this.py.pluginPythonPath;
      const processNames = [this.plugin.pluginName, this.plugin.displayName];
      const args: string[] = ['-u', pythonPluginPath, ...processNames];

      this.logger.debug(`Spawning plugin: ${this.plugin.pluginName}`);

      const caCertFile = join(this.py.serverPackagesPath, 'certifi', 'cacert.pem');
      const caCertEnv = existsSync(caCertFile) ? { SSL_CERT_FILE: caCertFile, REQUESTS_CA_BUNDLE: caCertFile } : {};

      this.worker = spawn(this.py.pluginPythonPath, args, {
        env: {
          PYTHONUNBUFFERED: '1',
          PYTHONPATH: this.createPythonPath(),
          ...caCertEnv,
          ...this.getEnv(),
        },
        cwd: this.plugin.mainPath,
        windowsHide: true,
      });

      this.worker.on('spawn', this.onSpawn.bind(this, this.worker.pid!, command, args, processNames, resolve));
      this.worker.on('error', this.onError.bind(this, reject));
      this.worker.on('exit', this.onExit.bind(this));

      this.worker.stdout?.on('data', this.onData.bind(this));
      this.worker.stderr?.on('data', this.onData.bind(this));
    });
  }

  private async updatePython(): Promise<void> {
    if (this.plugin.isPython) {
      if (!this.pluginManager) {
        await installWorkerServerEnv(this.py);
      }

      await this.py.installPluginPython();

      const requirementsPath = join(this.plugin.installPath, 'requirements.txt');
      if (existsSync(requirementsPath) && statSync(requirementsPath).size > 0) {
        await this.py.updatePluginDependencies(requirementsPath);
      }

      // pluginManager only exists on the master; on a worker installPluginPython
      // above already provisioned the interpreter.
      if (this.pluginManager && !this.pluginManager.installedPythonVersions.has(this.plugin.contract.pythonVersion ?? DEFAULT_PY_VERSION)) {
        throw new Error(`Python version ${this.plugin.contract.pythonVersion ?? DEFAULT_PY_VERSION} is not installed! Cannot start ${this.plugin.pluginName}.`);
      }
    }
  }

  private createPythonPath(): string {
    const separator = platform() === 'win32' ? ';' : ':';
    return [this.py.serverPackagesPath, pythonPath, this.py.pluginPackagesPath, this.plugin.mainPath].join(separator);
  }
}
