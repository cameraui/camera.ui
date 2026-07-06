import { container } from 'tsyringe';

import type { NotifierDevice } from '@camera.ui/sdk';
import type { NotifierDeviceWithSource, SourcesListing } from '../../manager/types.js';
import type { ProxyServer } from '../../rpc/index.js';
import type { Database } from '../database/index.js';
import type { DBNotificationSettings, DBRoles, StoredNotification } from '../database/types.js';

export interface RegisterDeviceInput {
  pluginName: string;
  input: Record<string, unknown>;
}

export class NotificationsService {
  private dbs: Database;
  private proxyServer: ProxyServer;

  constructor() {
    this.dbs = container.resolve<Database>('dbs');
    this.proxyServer = container.resolve<ProxyServer>('proxy');
  }

  public async getSettings(userId: string): Promise<DBNotificationSettings> {
    const stored = this.dbs.notificationsDB.get(userId);
    if (stored) return stored;
    // default = opt-out master toggle; user enables notifications from settings UI.
    return {
      _id: userId,
      enabled: false,
    };
  }

  public async setSettings(userId: string, settings: DBNotificationSettings): Promise<void> {
    if (settings._id !== userId) {
      // RPC surface is reachable from plugins, so guard defensively
      throw new Error(`settings._id "${settings._id}" does not match userId "${userId}"`);
    }
    await this.dbs.notificationsDB.put(userId, settings);
  }

  public async listDevices(userId: string, userRole: DBRoles): Promise<NotifierDeviceWithSource[]> {
    return this.proxyServer.notificationManager.listAllDevices(userId, userRole);
  }

  public listSources(userRole: DBRoles): SourcesListing {
    return this.proxyServer.notificationManager.listSources(userRole);
  }

  public getHistory(userId: string): StoredNotification[] {
    return this.proxyServer.notificationManager.getHistory(userId);
  }

  public async clearHistory(userId: string): Promise<void> {
    await this.proxyServer.notificationManager.clearHistory(userId);
  }

  public async registerDevice(userId: string, body: RegisterDeviceInput): Promise<NotifierDevice> {
    return this.proxyServer.notificationManager.registerDevice(body.pluginName, userId, body.input);
  }

  public async revokeDevice(deviceId: string, requesterUserId: string, requesterRole: DBRoles): Promise<void> {
    await this.proxyServer.notificationManager.revokeDevice(deviceId, requesterUserId, requesterRole);
  }

  public async updateDevice(deviceId: string, patch: Record<string, unknown>, requesterUserId: string, requesterRole: DBRoles): Promise<NotifierDevice> {
    return this.proxyServer.notificationManager.updateDevice(deviceId, patch, requesterUserId, requesterRole);
  }
}
