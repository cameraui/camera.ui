import { inject } from '../../../container.js';
import { PluginsService } from '../../services/plugins.service.js';
import { onClientEvent } from '../client-events.js';

import type { Namespace, Server, Socket } from 'socket.io';
import type { PluginManager } from '../../../plugins/index.js';
import type { PluginRuntimeInfo, SocketNsp } from '../types.js';

export class PluginsNamespace {
  public nsp: Namespace;
  public nspName: SocketNsp = '/plugins';

  private pluginManager: PluginManager;
  private pluginsService = new PluginsService();

  constructor(io: Server) {
    this.pluginManager = inject('pluginManager');

    this.nsp = io.of(this.nspName);
    this.nsp.on('connection', (socket: Socket) => {
      onClientEvent(socket, 'get-plugin-status', this.pluginStatus.bind(this));
      onClientEvent(socket, 'get-manage-queue', (_payload: unknown, callback?: (data: unknown) => void) => callback?.(this.pluginsService.installingPlugins()));
      socket.emit('manage-queue', this.pluginsService.installingPlugins());
    });
  }

  public async pluginStatus(
    pluginName: string,
    callback?: (data: PluginRuntimeInfo & { pluginName: string }) => void,
  ): Promise<void | (PluginRuntimeInfo & { pluginName: string })> {
    const plugin = this.pluginManager.plugins.get(pluginName);

    if (plugin) {
      const data = {
        name: pluginName,
        pluginName,
        status: plugin.worker.status,
        placement: plugin.worker.placementInfo,
      };

      callback?.(data);
      return data;
    }
  }
}
