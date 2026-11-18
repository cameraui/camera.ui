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

  public async start(signal?: AbortSignal, instanceId?: string): Promise<void> {
    if (this.isRunning()) {
      return;
    }
    signal?.throwIfAborted();

    return new Promise<void>((resolve, reject) => {
      this.logger.log(`Starting plugin: ${this.plugin.displayName} (${this.plugin.pluginName}.${this.plugin.info.installedVersion})...`);

      const command = process.execPath;
      const processNames = [this.plugin.pluginName, this.plugin.displayName];
      const args: string[] = [nodePluginPath, ...processNames];

      this.logger.debug(`Forking plugin: ${this.plugin.pluginName}`);

      const supervision = this.prepareSpawn(instanceId);
      const worker = fork(nodePluginPath, [...processNames], {
        env: {
          ...this.processEnv(),
          ...this.getEnv(),
          NODE_PATH: this.createNodePath(),
          ...(IS_DEV && !IS_ELECTRON ? { TSX_TSCONFIG_PATH: serverTsconfigPath } : {}),
        },
        cwd: this.plugin.mainPath,
        // windows: a read waiting on a synchronous stdin pipe blocks every other call on it, a dll peeking stdin while it loads hangs
        stdio: ['overlapped', 'pipe', 'pipe', 'ipc'],
        detached: supervision.detached,
        windowsHide: supervision.windowsHide,
        execArgv: IS_DEV && !IS_ELECTRON ? [`--import=${import.meta.resolve('tsx')}`, '--trace-warnings'] : undefined,
      });

      this.attach(worker, supervision, { command, args, titles: processNames }, resolve, reject);
    });
  }

  private createNodePath(): string {
    const paths: string[] = [];

    // the sdk path finds the server's node_modules for every install method
    try {
      const typesPath = require.resolve('@camera.ui/sdk');
      const nodeModulesMatch = /^(.+[/\\]node_modules)[/\\]@camera\.ui/.exec(typesPath);
      if (nodeModulesMatch) {
        paths.push(nodeModulesMatch[1]);
      }
    } catch {
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
}
