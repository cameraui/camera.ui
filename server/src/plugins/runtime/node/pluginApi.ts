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
    public readonly proxy: RPCClient,
    public readonly plugin: PluginInfo,
    public readonly storagePath: string,
    public readonly logger: Logger,
    public readonly pluginDb: PluginConfigDb,
  ) {
    super();

    this._storageController = new StorageController(this, this.proxy, this.plugin, this.pluginDb);
    this.coreManager = new CoreManagerProxy(this.proxy, this.plugin);
    this.deviceManager = new DeviceManagerProxy(this.proxy, this._storageController, this.plugin, this.logger);
    this.downloadManager = new DownloadManagerProxy(this.proxy);
    this.notificationManager = new NotificationManagerProxy(this.proxy, this.plugin);
  }
}
