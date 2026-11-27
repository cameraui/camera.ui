import { isEqual } from '@camera.ui/common/utils';

import { inject } from '../../container.js';
import { isMuteActive } from '../../manager/types.js';

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
    const bell = this.dbs.notificationsDB.get(userId)?.bell;
    await this.dbs.notificationsDB.put(userId, settings);
    if (!isEqual(bell, settings.bell)) this.proxyServer.notificationManager.bellChanged(userId);
  }

  public async patchSettings(userId: string, patch: Partial<Omit<DBNotificationSettings, '_id'>>): Promise<void> {
    await this.dbs.commit(this.dbs.notificationsDB, userId, (current) => ({ ...(current ?? { _id: userId, enabled: false }), ...patch, _id: userId }));
  }

  public async mute(userId: string, minutes: number | undefined, cameraIds?: string[]): Promise<DBNotificationSettings> {
    const until = minutes ? Date.now() + minutes * 60_000 : null;
    return this.commitMute(userId, (settings) =>
      cameraIds
        ? { ...settings, mutedCameras: { ...activeCameraMutes(settings), ...Object.fromEntries(cameraIds.map((cameraId) => [cameraId, until])) } }
        : { ...settings, mutedUntil: until },
    );
  }

  public async unmute(userId: string, cameraIds?: string[]): Promise<DBNotificationSettings> {
    const cameras = [...this.dbs.camerasDB.getRange()].map(({ value }) => value._id);
    return this.commitMute(userId, ({ mutedUntil, ...settings }) => {
      if (!cameraIds) return settings;
      const muted = activeCameraMutes(settings);
      if (isMuteActive(mutedUntil, Date.now())) for (const cameraId of cameras) muted[cameraId] = laterEnd(muted[cameraId], mutedUntil!);
      const mutedCameras = Object.fromEntries(Object.entries(muted).filter(([cameraId]) => !cameraIds.includes(cameraId)));
      return { ...settings, mutedCameras };
    });
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

  public async remove(userId: string, ids?: string[], bell?: boolean): Promise<void> {
    await this.proxyServer.notificationManager.remove(userId, ids, bell);
  }

  public getHistoryImagePath(userId: string, id: string): string | null {
    return this.proxyServer.notificationManager.getImagePath(userId, id);
  }

  public getHistoryVideoPath(userId: string, id: string): string | null {
    return this.proxyServer.notificationManager.getVideoPath(userId, id);
  }

  public async markSeen(userId: string, ids?: string[], bell?: boolean): Promise<void> {
    await this.proxyServer.notificationManager.markSeen(userId, ids, bell);
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

  private async commitMute(userId: string, apply: (settings: DBNotificationSettings) => DBNotificationSettings): Promise<DBNotificationSettings> {
    const settings = await this.dbs.commit(this.dbs.notificationsDB, userId, (current) => apply(current ?? { _id: userId, enabled: false }));
    this.proxyServer.notificationManager.muteChanged(userId);
    return settings!;
  }
}

function activeCameraMutes(settings: DBNotificationSettings): Record<string, number | null> {
  const now = Date.now();
  return Object.fromEntries(Object.entries(settings.mutedCameras ?? {}).filter(([, until]) => isMuteActive(until, now)));
}

function laterEnd(a: number | null | undefined, b: number | null): number | null {
  if (a === null || b === null) return null;
  return Math.max(a ?? 0, b);
}
