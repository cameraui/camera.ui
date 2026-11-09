import { inject } from '../../container.js';

import type { NotifierDevice } from '@camera.ui/sdk';
import type { NotifierDeviceWithSource, SourcesListing } from '../../manager/types.js';
import type { ProxyServer } from '../../rpc/index.js';
import type { Database } from '../database/index.js';
import type { DBNotificationSettings, DBRoles, StoredNotification } from '../database/types.js';
import type { NotificationListQueryInput } from '../schemas/notifications.schema.js';
import type { NotificationPage } from '../types/index.js';

export interface RegisterDeviceInput {
  pluginName: string;
  input: Record<string, unknown>;
}

export class NotificationsService {
  private dbs: Database;
  private proxyServer: ProxyServer;

  constructor() {
    this.dbs = inject('dbs');
    this.proxyServer = inject('proxy');
  }

  public async getSettings(userId: string): Promise<DBNotificationSettings> {
    const stored = this.dbs.notificationsDB.get(userId);
    if (stored) return stored;
    return {
      _id: userId,
      enabled: false,
    };
  }

  public async setSettings(userId: string, settings: DBNotificationSettings): Promise<void> {
    if (settings._id !== userId) {
      // plugins reach this over RPC
      throw new Error(`settings._id "${settings._id}" does not match userId "${userId}"`);
    }
    await this.dbs.notificationsDB.put(userId, settings);
  }

  public async patchSettings(userId: string, patch: Partial<Omit<DBNotificationSettings, '_id'>>): Promise<void> {
    await this.dbs.commit(this.dbs.notificationsDB, userId, (current) => ({ ...(current ?? { _id: userId, enabled: false }), ...patch, _id: userId }));
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

  public list(userId: string, query: NotificationListQueryInput): NotificationPage {
    return this.proxyServer.notificationManager.page(userId, query);
  }

  public get(userId: string, id: string): StoredNotification | undefined {
    return this.proxyServer.notificationManager.getEntry(userId, id);
  }

  public async remove(userId: string, ids?: string[]): Promise<void> {
    await this.proxyServer.notificationManager.remove(userId, ids);
  }

  public getHistoryImagePath(userId: string, id: string): string | null {
    return this.proxyServer.notificationManager.getImagePath(userId, id);
  }

  public getHistoryVideoPath(userId: string, id: string): string | null {
    return this.proxyServer.notificationManager.getVideoPath(userId, id);
  }

  public async markSeen(userId: string, ids?: string[]): Promise<void> {
    await this.proxyServer.notificationManager.markSeen(userId, ids);
  }

  public async markUnseen(userId: string, id: string): Promise<void> {
    await this.proxyServer.notificationManager.markUnseen(userId, id);
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
