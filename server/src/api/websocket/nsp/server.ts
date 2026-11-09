import { APP_SERVER_NAME, IS_ELECTRON } from '@camera.ui/common/utils';
import { Severity } from '@camera.ui/sdk';

import { inject, tryInject } from '../../../container.js';
import { t } from '../../../i18n/index.js';
import { SystemNotificationTypeId } from '../../../manager/types.js';
import { ConfigService } from '../../../services/config/index.js';
import { serverNodeIssue } from '../../../utils/engines.js';
import { announceUpdateChannel } from '../../../utils/ipc.js';
import { checkForUpdate } from '../../../utils/npm/index.js';
import { workerBehind } from '../../../workers/lifecycle/update.js';
import { PluginsService } from '../../services/plugins.service.js';

import type { Namespace, Server, Socket } from 'socket.io';
import type { MqttStatus } from '../../../mqtt/types.js';
import type { ProxyServer } from '../../../rpc/index.js';
import type { AppUpdateAvailableMessage } from '../../../types.js';
import type { EngineIssue, INpmPluginState } from '../../types/index.js';
import type { SocketNsp } from '../types.js';

const UPDATE_CHECK_MS = 10 * 60 * 1000; // the desktop app's updater pace, every check hits the npm registry

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

  private serverEngineIssue: EngineIssue | undefined;

  private pluginUpdates: INpmPluginState[] = [];

  private workerUpdateAvailable = false;
  private notifiedWorkerUpdates = new Set<string>();

  private checkPluginUpdateInterval: NodeJS.Timeout | undefined;
  private checkServerUpdateInterval: NodeJS.Timeout | undefined;

  private lastNotifiedServerVersion: string | undefined;
  private lastNotifiedAppVersion: string | undefined;

  constructor(io: Server) {
    this.proxyServer = inject('proxy');
    this.pluginsService = new PluginsService();
    this.configService = inject('configService');

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
      announceUpdateChannel(this.configService.config.betaUpdates ?? false);
    }
  }

  public getUpdates(_payload?: any, callback?: Function): { server?: INpmPluginState; plugins: INpmPluginState[]; workerUpdateAvailable: boolean } {
    this.refreshWorkerUpdateAvailable();
    const data = {
      server: this.serverUpdate,
      plugins: this.pluginUpdates,
      workerUpdateAvailable: this.workerUpdateAvailable,
    };

    callback?.(data);
    return data;
  }

  public getServerEngineIssue(): EngineIssue | undefined {
    return this.serverEngineIssue;
  }

  public targetServerVersion(): string {
    const hasUpdate = !IS_ELECTRON && (this.serverUpdate.updateAvailable || this.serverUpdate.betaUpdateAvailable) && !this.serverEngineIssue;
    return (hasUpdate ? this.serverUpdate.latestVersion : undefined) ?? ConfigService.RUNNING_VERSION;
  }

  public refreshWorkerUpdateAvailable(): void {
    const workers = tryInject('workerManager')?.getWorkers() ?? [];
    const behind = workers.filter((worker) => workerBehind(worker));
    const updatable = behind.filter((worker) => worker.state === 'online' || worker.state === 'outdated');

    const available = updatable.length > 0;
    if (available !== this.workerUpdateAvailable) {
      this.workerUpdateAvailable = available;
      this.nsp.emit('worker-updates', { updateAvailable: available });
    }

    const target = this.targetServerVersion();
    const fresh = updatable.map((worker) => `${worker.agentId}:${worker.bootId}:${target}`).filter((key) => !this.notifiedWorkerUpdates.has(key));
    if (fresh.length > 0) {
      fresh.forEach((key) => this.notifiedWorkerUpdates.add(key));
      this.proxyServer.notificationManager.notify({
        source: { kind: 'system', id: SystemNotificationTypeId.WorkerUpdateAvailable },
        notification: {
          title: t('updates.worker_title'),
          body: t('updates.worker_available'),
          severity: Severity.Info,
          tag: SystemNotificationTypeId.WorkerUpdateAvailable,
          deepLink: '/updates',
        },
      });
    } else if (behind.length === 0 && this.notifiedWorkerUpdates.size > 0) {
      this.notifiedWorkerUpdates.clear();
      this.proxyServer.notificationManager.removeByTagForAll(SystemNotificationTypeId.WorkerUpdateAvailable);
    }
  }

  public getMqttStatus(_payload?: any, callback?: Function): MqttStatus | undefined {
    const status = tryInject('mqttManager')?.getStatus();
    callback?.(status);
    return status;
  }

  public async checkPlugins(interval?: boolean): Promise<void> {
    const pluginUpdatesSize = this.pluginUpdates.length;

    await this.checkPluginUpdates();

    if (this.pluginUpdates.length > 0) {
      if (pluginUpdatesSize !== this.pluginUpdates.length || interval) {
        this.nsp.emit('plugin-updates', this.pluginUpdates);
      }

      if (!pluginUpdatesSize) {
        this.proxyServer.notificationManager.notify({
          source: { kind: 'system', id: SystemNotificationTypeId.PluginUpdateAvailable },
          notification: {
            title: t('updates.plugin_title'),
            body: t('updates.plugin_available'),
            severity: Severity.Info,
            tag: SystemNotificationTypeId.PluginUpdateAvailable,
            deepLink: '/updates',
          },
        });
      }

      this.restartPluginInterval();
    } else {
      if (pluginUpdatesSize > 0) {
        this.nsp.emit('plugin-updates', this.pluginUpdates);
      }

      this.proxyServer.notificationManager.removeByTagForAll(SystemNotificationTypeId.PluginUpdateAvailable);
      this.restartPluginInterval();
    }
  }

  public async checkServer(interval?: boolean): Promise<void> {
    if (IS_ELECTRON) return;

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
            title: t(this.serverUpdate.betaUpdateAvailable ? 'updates.beta_update_title' : 'updates.update_title'),
            body: this.serverUpdate.latestVersion ? t('updates.server_available', { version: this.serverUpdate.latestVersion }) : t('updates.server_available_unknown'),
            severity: Severity.Info,
            tag: SystemNotificationTypeId.UpdateAvailable,
            deepLink: '/updates',
          },
        });
      }

      this.restartServerInterval();
    } else {
      if (hadUpdate) {
        this.nsp.emit('server-updates', this.serverUpdate);
      }

      this.lastNotifiedServerVersion = undefined;
      this.proxyServer.notificationManager.removeByTagForAll(SystemNotificationTypeId.UpdateAvailable);
      this.restartServerInterval();
    }
  }

  public restartPluginInterval(timer = UPDATE_CHECK_MS): void {
    clearInterval(this.checkPluginUpdateInterval);
    this.checkPluginUpdateInterval = setInterval(() => {
      this.checkPlugins(true);
    }, timer);
  }

  public restartServerInterval(timer = UPDATE_CHECK_MS): void {
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

      // on desktop the app update is the server update
      if (!this.serverUpdate.updateAvailable || this.serverUpdate.latestVersion !== message.version) {
        this.serverUpdate = { ...this.serverUpdate, updateAvailable: true, latestVersion: message.version };
        this.nsp.emit('server-updates', this.serverUpdate);
      }

      if (message.version === this.lastNotifiedAppVersion) {
        return;
      }

      this.lastNotifiedAppVersion = message.version;

      this.proxyServer.notificationManager.notify({
        source: { kind: 'system', id: SystemNotificationTypeId.AppUpdateAvailable },
        notification: {
          title: t('updates.update_title'),
          body: t('updates.app_ready', { version: message.version }),
          severity: Severity.Info,
          tag: SystemNotificationTypeId.AppUpdateAvailable,
          deepLink: '/updates',
        },
      });
    });
  }

  private async checkServerUpdate(): Promise<void> {
    try {
      const state = await checkForUpdate(APP_SERVER_NAME, ConfigService.VERSION, 'beta', this.configService.config.betaUpdates ?? false);
      const hasUpdate = state.updateAvailable || state.betaUpdateAvailable;
      this.serverEngineIssue = hasUpdate ? serverNodeIssue() : undefined;
      this.serverUpdate = state;
    } catch {
      // keep the last known state
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
          pluginStates.push({ ...state, pluginName: plugin.info.pluginName, installedVersion: plugin.info.installedVersion });
        }
      } catch {
        // skip this plugin
      }
    }

    this.pluginUpdates = pluginStates;
  }
}
