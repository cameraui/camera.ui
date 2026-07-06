import { NamespaceManager } from '../../../../rpc/namespaces.js';

import type { RPCClient } from '@camera.ui/rpc';
import type { Notification, NotificationManager, PluginInfo } from '@camera.ui/sdk';
import type { NotificationManagerNamespaces } from '../../../../rpc/namespaces.js';

interface PublishEnvelope {
  pluginId: string;
  pluginName: string;
  notification: Notification;
}

export class NotificationManagerProxy implements NotificationManager {
  #proxy: RPCClient;
  #plugin: PluginInfo;
  #namespaces: NotificationManagerNamespaces;

  constructor(proxy: RPCClient, plugin: PluginInfo) {
    this.#proxy = proxy;
    this.#plugin = plugin;
    this.#namespaces = NamespaceManager.notificationManagerNamespaces();
  }

  async publish(notification: Notification): Promise<void> {
    const envelope: PublishEnvelope = {
      pluginId: this.#plugin.id,
      pluginName: this.#plugin.name,
      notification,
    };
    await this.#proxy.publish(this.#namespaces.notificationsPublishSubject, envelope);
  }
}
