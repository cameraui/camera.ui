import { APP_SERVER_NAME, IS_ELECTRON } from '@camera.ui/common/utils';
import { Severity } from '@camera.ui/sdk';
import { container } from 'tsyringe';

import { SystemNotificationTypeId } from '../../../manager/types.js';
import { ConfigService } from '../../../services/config/index.js';
import { checkForUpdate } from '../../../utils/npm/index.js';
import { PluginsService } from '../../services/plugins.service.js';

import type { Namespace, Server, Socket } from 'socket.io';
import type { MqttManager } from '../../../mqtt/manager.js';
import type { MqttStatus } from '../../../mqtt/types.js';
import type { ProxyServer } from '../../../rpc/index.js';
import type { AppUpdateAvailableMessage } from '../../../types.js';
import type { INpmPluginState } from '../../types/index.js';
import type { SocketNsp } from '../types.js';

export class ServerNamespace {
  public nsp: Namespace;
  public nspName: SocketNsp = '/server';

  private proxyServer: ProxyServer;
  private pluginsService: PluginsService;
  private configService: ConfigService;

  private serverUpdate: INpmPluginState = {
    updateAvailable: false,
    betaUpdateAvailable: false,
  };

  private pluginUpdates: INpmPluginState[] = [];

  private checkPluginUpdateInterval: NodeJS.Timeout | undefined;
  private checkServerUpdateInterval: NodeJS.Timeout | undefined;

  private lastNotifiedServerVersion: string | undefined;
  private lastNotifiedAppVersion: string | undefined;

  constructor(io: Server) {
    this.proxyServer = container.resolve<ProxyServer>('proxy');
    this.pluginsService = new PluginsService();
    this.configService = container.resolve<ConfigService>('configService');

    this.nsp = io.of(this.nspName);
    this.nsp.on('connection', (socket: Socket) => {
      socket.on('get-updates', this.getUpdates.bind(this));
      socket.on('get-mqtt-status', this.getMqttStatus.bind(this));
    });

    this.checkPlugins();

    if (!IS_ELECTRON) {
      this.checkServer();
    } else {
      this.listenForAppUpdates();
    }
  }

  public getUpdates(_payload?: any, callback?: Function): { server?: INpmPluginState; plugins: INpmPluginState[] } {
    const data = {
      server: this.serverUpdate,
      plugins: this.pluginUpdates,
    };

    callback?.(data);
    return data;
  }

  public getMqttStatus(_payload?: any, callback?: Function): MqttStatus | undefined {
    let status: MqttStatus | undefined;
    try {
      status = container.resolve<MqttManager>('mqttManager').getStatus();
    } catch {
      // manager not constructed (worker mode)
    }

    callback?.(status);
    return status;
  }

  public async checkPlugins(interval?: boolean): Promise<void> {
    const pluginUpdatesSize = this.pluginUpdates.length;

    await this.checkPluginUpdates();

    if (this.pluginUpdates.length > 0) {
      if (!pluginUpdatesSize || interval) {
        this.nsp.emit('plugins-updates', this.pluginUpdates);
      }

      if (!pluginUpdatesSize) {
        this.proxyServer.notificationManager.notify({
          source: { kind: 'system', id: SystemNotificationTypeId.PluginUpdateAvailable },
          notification: {
            title: 'Plugin Update',
            body: 'New plugin updates available',
            severity: Severity.Info,
            tag: SystemNotificationTypeId.PluginUpdateAvailable,
            deepLink: '/plugins',
          },
        });
      }

      this.restartPluginInterval(10 * 60 * 1000);
    } else {
      this.proxyServer.notificationManager.removeByTagForAll(SystemNotificationTypeId.PluginUpdateAvailable);
      this.restartPluginInterval();
    }
  }

  public async checkServer(interval?: boolean): Promise<void> {
    const hadUpdate = this.serverUpdate.updateAvailable || this.serverUpdate.betaUpdateAvailable;

    await this.checkServerUpdate();

    const hasUpdate = this.serverUpdate.updateAvailable || this.serverUpdate.betaUpdateAvailable;

    if (hasUpdate) {
      if (!hadUpdate || interval) {
        this.nsp.emit('server-updates', this.serverUpdate);
      }

      if (this.serverUpdate.latestVersion !== this.lastNotifiedServerVersion) {
        this.lastNotifiedServerVersion = this.serverUpdate.latestVersion;
        this.proxyServer.notificationManager.notify({
          source: { kind: 'system', id: SystemNotificationTypeId.UpdateAvailable },
          notification: {
            title: 'Update',
            body: 'New camera.ui update available',
            severity: Severity.Info,
            tag: SystemNotificationTypeId.UpdateAvailable,
            deepLink: '/settings/system',
          },
        });
      }

      this.restartServerInterval(10 * 60 * 1000);
    } else {
      this.lastNotifiedServerVersion = undefined;
      this.proxyServer.notificationManager.removeByTagForAll(SystemNotificationTypeId.UpdateAvailable);
      this.restartServerInterval();
    }
  }

  public restartPluginInterval(timer = 20000): void {
    clearInterval(this.checkPluginUpdateInterval);
    this.checkPluginUpdateInterval = setInterval(() => {
      this.checkPlugins(true);
    }, timer);
  }

  public restartServerInterval(timer = 20000): void {
    clearInterval(this.checkServerUpdateInterval);
    this.checkServerUpdateInterval = setInterval(() => {
      this.checkServer(true);
    }, timer);
  }

  private listenForAppUpdates(): void {
    this.proxyServer.notificationManager.removeByTagForAll(SystemNotificationTypeId.AppUpdateAvailable);

    process.on('message', (message: AppUpdateAvailableMessage) => {
      if (message?.type !== 'APP_UPDATE_AVAILABLE' || !message.version) {
        return;
      }

      if (message.version === this.lastNotifiedAppVersion) {
        return;
      }

      this.lastNotifiedAppVersion = message.version;

      this.proxyServer.notificationManager.notify({
        source: { kind: 'system', id: SystemNotificationTypeId.AppUpdateAvailable },
        notification: {
          title: 'Update',
          body: `camera.ui ${message.version} is ready to install`,
          severity: Severity.Info,
          tag: SystemNotificationTypeId.AppUpdateAvailable,
          deepLink: '/settings/system',
        },
      });
    });
  }

  private async checkServerUpdate(): Promise<void> {
    try {
      this.serverUpdate = await checkForUpdate(APP_SERVER_NAME, ConfigService.VERSION);
    } catch {
      // ignore — keep the last known state
    }
  }

  private async checkPluginUpdates(): Promise<void> {
    const plugins = this.pluginsService.listPlugins();
    const pluginStates: INpmPluginState[] = [];

    for (const plugin of plugins) {
      try {
        const state = await checkForUpdate(
          plugin.info.pluginName,
          plugin.info.installedVersion ?? '0.0.0',
          'beta',
          this.configService.config.plugins.betaVersions ?? false,
        );
        if (state.updateAvailable || state.betaUpdateAvailable) {
          pluginStates.push(state);
        }
      } catch {
        // skip this plugin
      }
    }

    this.pluginUpdates = pluginStates;
  }
}
