import { IS_DEV, IS_ELECTRON } from '@camera.ui/common/utils';
import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { nodePluginPath } from '../../../utils/path.js';
import { BasePluginRuntime } from '../base.js';

import type { RuntimePlugin } from '../base.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const serverTsconfigPath = resolve(__dirname, '..', '..', '..', '..', 'tsconfig.json');

export class NodePluginRuntime extends BasePluginRuntime {
  constructor(plugin: RuntimePlugin) {
    super(plugin);
  }

  public async start(): Promise<void> {
    if (this.isRunning()) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      this.logger.log(`Starting plugin: ${this.plugin.displayName} (${this.plugin.pluginName}.${this.plugin.info.installedVersion})...`);

      const command = process.execPath;
      const processNames = [this.plugin.pluginName, this.plugin.displayName];
      const args: string[] = [nodePluginPath, ...processNames];

      this.logger.debug(`Forking plugin: ${this.plugin.pluginName}`);

      this.worker = fork(nodePluginPath, [...processNames], {
        env: {
          ...this.cleanedProcessEnv(),
          ...this.getEnv(),
          NODE_PATH: this.createNodePath(),
          ...(IS_DEV && !IS_ELECTRON ? { TSX_TSCONFIG_PATH: serverTsconfigPath } : {}),
        },
        cwd: this.plugin.mainPath,
        silent: true,
        execArgv: IS_DEV && !IS_ELECTRON ? ['--import=tsx', '--trace-warnings'] : undefined,
      });

      this.worker.once('spawn', this.onSpawn.bind(this, this.worker.pid!, command, args, processNames, resolve));
      this.worker.once('error', this.onError.bind(this, reject));
      this.worker.once('exit', this.onExit.bind(this));

      this.worker.stdout?.on('data', this.onData.bind(this));
      this.worker.stderr?.on('data', this.onData.bind(this));
    });
  }

  private createNodePath(): string {
    const paths: string[] = [];

    // Resolve @camera.ui/sdk to locate the server's node_modules regardless of
    // install method (npm, Electron, service, etc.).
    try {
      const typesPath = require.resolve('@camera.ui/sdk');
      const nodeModulesMatch = /^(.+[/\\]node_modules)[/\\]@camera\.ui/.exec(typesPath);
      if (nodeModulesMatch) {
        paths.push(nodeModulesMatch[1]);
      }
    } catch {
      // Fallback: use relative path from __dirname (less reliable)
      const serverRoot = resolve(__dirname, '..', '..', '..', '..');
      paths.push(join(serverRoot, 'node_modules'));
    }

    const pluginNodeModules = join(this.plugin.installPath, 'node_modules');
    paths.push(pluginNodeModules);

    if (process.env.NODE_PATH) {
      paths.push(process.env.NODE_PATH);
    }

    return paths.join(delimiter);
  }

  private cleanedProcessEnv(): Record<string, string> {
    const env = { ...process.env } as Record<string, string>;

    delete env.CAMERA_UI_STORAGE_PATH;
    delete env.CAMERA_UI_DATABASE_PATH;
    delete env.CAMERA_UI_USERS_STORAGE_PATH;
    delete env.CAMERA_UI_PLUGINS_STORAGE_PATH;
    delete env.CAMERA_UI_PLUGINS_INSTALL_PATH;
    delete env.CAMERA_UI_PLUGINS_PJSON_FILE;
    delete env.CAMERA_UI_CONFIG_FILE;
    delete env.CAMERA_UI_SECRETS_FILE;
    delete env.CAMERA_UI_LOG_FILE;
    delete env.CAMERA_UI_GO2RTC_CONFIG_FILE;
    delete env.CAMERA_UI_GO2RTC_BINARY;
    delete env.CAMERA_UI_CLOUD_BINARY;
    delete env.CAMERA_UI_PORT;
    delete env.CAMERA_UI_INSECURE_PORT;
    delete env.CAMERA_UI_UI_PORT;

    return env;
  }
}
