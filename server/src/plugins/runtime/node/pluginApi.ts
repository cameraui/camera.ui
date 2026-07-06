import { EventEmitter } from 'node:events';

import { CoreManagerProxy } from './proxy/coreManager.js';
import { DeviceManagerProxy } from './proxy/deviceManager.js';
import { DownloadManagerProxy } from './proxy/downloadManager.js';
import { NotificationManagerProxy } from './proxy/notificationManager.js';
import { StorageController } from './storageController.js';

import type { Logger } from '@camera.ui/common';
import type { RPCClient } from '@camera.ui/rpc';
import type { PluginAPI as PluginAPIInterface, PluginInfo } from '@camera.ui/sdk';
import type { PluginConfigDb } from './configDb.js';

export class PluginAPI extends EventEmitter implements PluginAPIInterface {
  readonly coreManager: CoreManagerProxy;
  readonly deviceManager: DeviceManagerProxy;
  readonly downloadManager: DownloadManagerProxy;
  readonly notificationManager: NotificationManagerProxy;

  readonly _storageController: StorageController;

  constructor(
    proxy: RPCClient,
    plugin: PluginInfo,
    public readonly storagePath: string,
    logger: Logger,
    pluginDb: PluginConfigDb,
  ) {
    super();

    this._storageController = new StorageController(this, proxy, plugin, pluginDb);
    this.coreManager = new CoreManagerProxy(proxy, this, plugin);
    this.deviceManager = new DeviceManagerProxy(proxy, this, this._storageController, plugin, logger);
    this.downloadManager = new DownloadManagerProxy(proxy);
    this.notificationManager = new NotificationManagerProxy(proxy, plugin);
  }
}
