import { container } from 'tsyringe';

import type { Namespace, Server, Socket } from 'socket.io';
import type { PluginManager } from '../../../plugins/index.js';
import type { PLUGIN_STATUS } from '../../../plugins/types.js';
import type { SocketNsp } from '../types.js';

export class PluginsNamespace {
  public nsp: Namespace;
  public nspName: SocketNsp = '/plugins';

  private pluginManager: PluginManager;

  constructor(io: Server) {
    this.pluginManager = container.resolve<PluginManager>('pluginManager');

    this.nsp = io.of(this.nspName);
    this.nsp.on('connection', (socket: Socket) => {
      socket.on('get-plugin-status', this.pluginStatus.bind(this));
    });
  }

  public async pluginStatus(pluginName: string, callback?: Function): Promise<void | { pluginName: string; status: PLUGIN_STATUS }> {
    const plugin = this.pluginManager.plugins.get(pluginName);

    if (plugin) {
      const status = plugin.worker.status;
      const data = {
        pluginName,
        status,
      };

      callback?.(data);
      return data;
    }
  }
}
