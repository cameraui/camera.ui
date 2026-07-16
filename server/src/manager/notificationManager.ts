import { uuidv4 } from '@camera.ui/common/utils';
import { hasCapability, PluginCapability, Severity } from '@camera.ui/sdk';
import { container } from 'tsyringe';

import { NotificationsService } from '../api/services/notifications.service.js';
import { PluginsService } from '../api/services/plugins.service.js';
import { RemoteService } from '../api/services/remote.service.js';
import { UsersService } from '../api/services/users.service.js';
import { NamespaceManager } from '../rpc/namespaces.js';
import { SYSTEM_NOTIFICATION_TYPES } from './types.js';

import type { Promisify } from '@camera.ui/rpc';
import type { Notification, NotifierDevice, NotifierInterface, PluginInterface } from '@camera.ui/sdk';
import type { Database } from '../api/database/index.js';
import type { DBRoles, StoredNotification } from '../api/database/types.js';
import type { SocketService } from '../api/websocket/index.js';
import type { InternalEventBus } from '../internal-bus.js';
import type { Plugin } from '../plugins/plugin.js';
import type { ProxyServer } from '../rpc/index.js';
import type { NotifyResult } from '../rpc/interfaces/notification.js';
import type { LoggerService } from '../services/logger/index.js';
import type { NotificationSource, NotifierDeviceWithSource, NotifyOptions, ResolvedNotification, SourcesListing } from './types.js';

type NotifierProxy = Promisify<NotifierInterface>;

interface PublishEnvelope {
  pluginId: string;
  pluginName: string;
  notification: Notification;
}

const HISTORY_LIMIT = 100;

export class DeviceForbiddenError extends Error {}

export class NotificationManager {
  private proxyServer: ProxyServer;
  private logger: LoggerService;
  private dbs: Database;
  private notificationsService: NotificationsService;
  private pluginsService: PluginsService;
  private remoteService: RemoteService;
  private usersService: UsersService;

  private closePublishUnsub?: () => void;

  constructor() {
    this.proxyServer = container.resolve<ProxyServer>('proxy');
    this.logger = container.resolve<LoggerService>('logger');
    this.dbs = container.resolve<Database>('dbs');
    this.notificationsService = new NotificationsService();
    this.pluginsService = new PluginsService();
    this.remoteService = new RemoteService();
    this.usersService = new UsersService();
  }

  public async register(): Promise<void> {
    await this.subscribePublishTopic();
  }

  public async destroy(): Promise<void> {
    this.closePublishUnsub?.();
  }

  public async listAllDevices(userId: string, userRole: DBRoles): Promise<NotifierDeviceWithSource[]> {
    const plugins = this.getNotifierPlugins();
    if (plugins.length === 0) return [];

    const ownerFilter = userRole === 'master' || userRole === 'admin' ? [] : [userId];

    const results = await Promise.allSettled(
      plugins.map(async (plugin) => {
        try {
          const raw = (await this.getProxyFor(plugin).getDevices(ownerFilter)) ?? [];
          return raw.map<NotifierDeviceWithSource>((d) => ({
            ...d,
            pluginId: plugin.id,
            pluginName: plugin.pluginName,
          }));
        } catch (err) {
          this.logger.warn(`getDevices failed for "${plugin.pluginName}": ${(err as Error).message}`);
          return [] as NotifierDeviceWithSource[];
        }
      }),
    );
    const devices: NotifierDeviceWithSource[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) devices.push(...r.value);
    }
    return devices;
  }

  public listSources(userRole: DBRoles): SourcesListing {
    const publisherPlugins = this.pluginsService.listPlugins().filter((p) => hasCapability(p.contract, PluginCapability.PublishNotifications));
    const systemTypes = userRole === 'master' || userRole === 'admin' ? [...SYSTEM_NOTIFICATION_TYPES] : [];
    return {
      plugins: publisherPlugins.map((p) => ({ id: p.id, name: p.pluginName })),
      system: systemTypes,
    };
  }

  public getHistory(userId: string): StoredNotification[] {
    return this.historyFor(userId);
  }

  public unreadCount(userId: string): number {
    return this.historyFor(userId).filter((n) => n.seenAt == null).length;
  }

  public async clearHistory(userId: string): Promise<void> {
    await this.putHistory(userId, []);
    this.emitToUser(userId, 'history', []);
  }

  public async removeByTag(userId: string, tag: string): Promise<boolean> {
    const items = this.historyFor(userId);
    const next = items.filter((n) => n.tag !== tag);
    if (next.length === items.length) return false;
    await this.putHistory(userId, next);
    this.emitToUser(userId, 'history', next);
    return true;
  }

  public async removeByTagForAll(tag: string): Promise<void> {
    for (const user of this.usersService.list()) {
      await this.removeByTag(user._id, tag);
    }
  }

  public async markAllSeen(userId: string): Promise<void> {
    const items = this.historyFor(userId);
    let changed = false;
    const now = Date.now();
    for (const n of items) {
      if (n.seenAt == null) {
        n.seenAt = now;
        changed = true;
      }
    }
    if (!changed) return;
    await this.putHistory(userId, items);
    this.emitToUser(userId, 'history', items);
  }

  public async markSeen(userId: string, id: string): Promise<void> {
    const items = this.historyFor(userId);
    const item = items.find((n) => n.id === id);
    if (!item || item.seenAt != null) return;
    item.seenAt = Date.now();
    await this.putHistory(userId, items);
    this.emitToUser(userId, 'history', items);
  }

  public async notify(opts: NotifyOptions): Promise<NotifyResult[]> {
    const { source, targets } = opts;

    // Source-kind-specific permission checks.
    if (source.kind === 'plugin') {
      const plugin = this.pluginsService.getPluginById(source.id);
      if (!plugin) {
        this.logger.warn(`notify: plugin "${source.id}" not found, dropping`);
        return [];
      }
      if (!hasCapability(plugin.contract, PluginCapability.PublishNotifications)) {
        this.logger.error(`Plugin "${plugin.pluginName}" called Publish() without "publishNotifications" capability — declare it in your contract.`);
        return [];
      }
    }

    const userIds = await this.findRecipientUserIds(source, opts.notification.adminOnly ?? false);
    if (userIds.length === 0) return [];

    // Stamp the notification once — same id/createdAt go to UI and external
    // delivery so any client-side dedup matches across channels.
    const cloud = this.remoteService.getCloud();
    const originData: Record<string, string> = {};

    if (cloud.oauth?.server_id) originData.originServerId = cloud.oauth.server_id;
    if (cloud.name) originData.originName = cloud.name;

    const resolved: ResolvedNotification = {
      ...opts.notification,
      severity: opts.notification.severity ?? Severity.Info,
      id: uuidv4(),
      createdAt: Date.now(),
      source,
      data: { ...opts.notification.data, ...originData },
    };

    if (source.kind === 'system') {
      try {
        container.resolve<InternalEventBus>('internalBus').emitEvent('system:notification', {
          typeId: source.id,
          title: resolved.title,
          body: resolved.body,
          severity: String(resolved.severity),
        });
      } catch {
        // bus not registered (worker mode) — ignore
      }
    }

    // Per-user filtering (settings / source / quiet-hours / history) is
    // genuinely per recipient; delivery is batched per notifier afterwards.
    const eligibleUserIds: string[] = [];
    for (const userId of userIds) {
      const settings = await this.notificationsService.getSettings(userId);
      if (!settings.enabled) continue;
      if (source.kind === 'plugin' && settings.sources?.[source.id] === false) continue;
      if (source.kind === 'system' && settings.systemTypes?.[source.id] === false) continue;

      // UI broadcast happens before the quiet-hours check — quiet hours
      // suppress disruption (push/sound), not the in-app history entry.
      await this.appendHistory(userId, resolved);

      // Quiet-hours suppress external delivery (except critical bypass).
      if (resolved.severity !== Severity.Critical && this.inQuietHours(settings)) continue;

      eligibleUserIds.push(userId);
    }

    // Explicit-targets path: deliver to the given device ids directly.
    if (targets && targets.length > 0) {
      const results = await Promise.all(targets.map((deviceId) => this.dispatchToDevice(deviceId, resolved)));
      return results;
    }

    if (eligibleUserIds.length === 0) return [];

    // Batched fan-out: one getDevices + one sendNotification per notifier.
    const eligibleSet = new Set(eligibleUserIds);
    const tasks: Promise<NotifyResult[]>[] = [];
    for (const plugin of this.getNotifierPlugins()) {
      const proxy = this.getProxyFor(plugin);
      let devices: NotifierDevice[];
      try {
        devices = (await proxy.getDevices(eligibleUserIds)) ?? [];
      } catch (err) {
        this.logger.warn(`getDevices failed for "${plugin.pluginName}": ${(err as Error).message}`);
        continue;
      }
      const deviceIds = devices.filter((d) => d.active && eligibleSet.has(d.ownerUserId)).map((d) => d.id);
      if (deviceIds.length > 0) {
        tasks.push(this.dispatchBatch(plugin.pluginName, proxy, deviceIds, resolved));
      }
    }

    return (await Promise.all(tasks)).flat();
  }

  public async registerDevice(pluginName: string, ownerUserId: string, input: Record<string, unknown>): Promise<NotifierDevice> {
    const plugin = this.resolvePlugin(pluginName);
    if (!plugin) {
      throw new Error(`Plugin "${pluginName}" not found`);
    }
    const ifaces = plugin.contract.interfaces ?? [];
    if (!ifaces.includes('Notifier' as PluginInterface)) {
      throw new Error(`Plugin "${plugin.pluginName}" does not implement the Notifier interface`);
    }
    if (!plugin.worker.isRunning()) {
      throw new Error(`Plugin "${plugin.pluginName}" is not running`);
    }
    return this.getProxyFor(plugin).registerDevice(ownerUserId, input);
  }

  public async revokeDevice(deviceId: string, requesterUserId: string, requesterRole: DBRoles): Promise<void> {
    for (const plugin of this.getNotifierPlugins()) {
      const proxy = this.getProxyFor(plugin);
      let device: NotifierDevice | null = null;
      try {
        device = (await proxy.getDevice(deviceId)) ?? null;
      } catch {
        // getDevice may legitimately throw on unknown ids — try next plugin.
        continue;
      }
      if (!device) continue;

      this.assertCanManageDevice(device, requesterUserId, requesterRole);
      await proxy.revokeDevice(deviceId);
      return;
    }
  }

  public async updateDevice(deviceId: string, patch: Record<string, unknown>, requesterUserId: string, requesterRole: DBRoles): Promise<NotifierDevice> {
    for (const plugin of this.getNotifierPlugins()) {
      const proxy = this.getProxyFor(plugin);
      let device: NotifierDevice | null = null;
      try {
        device = (await proxy.getDevice(deviceId)) ?? null;
      } catch {
        continue;
      }
      if (!device) continue;
      this.assertCanManageDevice(device, requesterUserId, requesterRole);
      const updated = await proxy.updateDevice(deviceId, patch);
      if (updated) return updated;
    }
    throw new Error(`Device not found: ${deviceId}`);
  }

  private assertCanManageDevice(device: NotifierDevice, requesterUserId: string, requesterRole: DBRoles): void {
    const isAdmin = requesterRole === 'master' || requesterRole === 'admin';
    if (!isAdmin && device.ownerUserId !== requesterUserId) {
      throw new DeviceForbiddenError('You can only manage your own devices');
    }
  }

  private getNotifierPlugins(): Plugin[] {
    return this.pluginsService.listPlugins().filter((p) => {
      const ifaces = p.contract.interfaces ?? [];
      return ifaces.includes('Notifier' as PluginInterface) && p.worker.isRunning();
    });
  }

  private getProxyFor(plugin: Plugin): NotifierProxy {
    const ns = NamespaceManager.pluginNamespaces(plugin.id).pluginChildRpc;
    return this.proxyServer.proxy.createProxy<NotifierInterface>(ns);
  }

  private resolvePlugin(idOrName: string): Plugin | null {
    return (
      this.pluginsService.getPluginById(idOrName) ??
      this.pluginsService.getPluginByName(idOrName) ??
      this.pluginsService.listPlugins().find((p) => p.pluginName.split('/').pop() === idOrName) ??
      null
    );
  }

  private async dispatchBatch(pluginName: string, proxy: NotifierProxy, deviceIds: string[], n: Notification): Promise<NotifyResult[]> {
    try {
      await proxy.sendNotification(deviceIds, n);
      return deviceIds.map((deviceId) => ({ pluginName, deviceId, ok: true }));
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      this.logger.warn(`sendNotification("${pluginName}", ${deviceIds.length} devices) failed: ${message}`);
      return deviceIds.map((deviceId) => ({ pluginName, deviceId, ok: false, error: message }));
    }
  }

  private async dispatchToDevice(deviceId: string, n: Notification): Promise<NotifyResult> {
    for (const plugin of this.getNotifierPlugins()) {
      const proxy = this.getProxyFor(plugin);
      try {
        const device = await proxy.getDevice(deviceId);
        if (device) {
          const [result] = await this.dispatchBatch(plugin.pluginName, proxy, [deviceId], n);
          return result;
        }
      } catch {
        // getDevice may legitimately throw on unknown ids — try next plugin.
      }
    }
    return { pluginName: '', deviceId, ok: false, error: 'device not found' };
  }

  private inQuietHours(settings: { quietHours?: { from: string; to: string; timezone: string } }): boolean {
    const qh = settings.quietHours;
    if (!qh) return false;
    try {
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: qh.timezone }));
      const minutes = now.getHours() * 60 + now.getMinutes();
      const fromMin = parseHHmm(qh.from);
      const toMin = parseHHmm(qh.to);
      if (fromMin === null || toMin === null) return false;
      return fromMin <= toMin ? minutes >= fromMin && minutes < toMin : minutes >= fromMin || minutes < toMin;
    } catch {
      return false;
    }
  }

  private async findRecipientUserIds(source: NotificationSource, adminOnly: boolean): Promise<string[]> {
    const users = this.usersService.list();
    if (source.kind === 'system' || adminOnly) {
      return users.filter((u) => u.role === 'master' || u.role === 'admin').map((u) => u._id);
    }
    return users.map((u) => u._id);
  }

  private async subscribePublishTopic(): Promise<void> {
    const subject = NamespaceManager.notificationManagerNamespaces().notificationsPublishSubject;
    try {
      this.closePublishUnsub = await this.proxyServer.proxy.subscribe<PublishEnvelope>(subject, (msg) => {
        if (!msg?.notification || !msg.pluginId) return;
        // Synchronous handler — slow notify() must not backpressure the
        // NATS consumer. Errors are logged inside notify().
        this.notify({
          notification: msg.notification,
          source: { kind: 'plugin', id: msg.pluginId },
        }).catch((err) => {
          this.logger.warn(`notify(publish from "${msg.pluginName}") failed: ${(err as Error).message}`);
        });
      });
    } catch (err) {
      this.logger.warn(`Failed to subscribe to ${subject}: ${(err as Error).message}`);
    }
  }

  private async appendHistory(userId: string, n: ResolvedNotification): Promise<void> {
    const stored: StoredNotification = {
      id: n.id,
      createdAt: n.createdAt,
      seenAt: null,
      title: n.title,
      subtitle: n.subtitle,
      body: n.body,
      severity: n.severity,
      tag: n.tag,
      imageUrl: n.imageUrl,
      deepLink: n.deepLink,
      source: n.source,
      data: n.data,
    };

    const items = this.historyFor(userId);
    const deduped = stored.tag ? items.filter((h) => h.tag !== stored.tag) : items;
    deduped.unshift(stored);
    if (deduped.length > HISTORY_LIMIT) deduped.length = HISTORY_LIMIT;

    await this.putHistory(userId, deduped);
    this.emitToUser(userId, 'notification', stored);
  }

  private emitToUser(userId: string, event: string, payload: unknown): void {
    try {
      const socketService = container.resolve<SocketService>('socketService');
      socketService.io.of('/notifications').to(`user:${userId}`).emit(event, payload);
    } catch (err) {
      this.logger.warn(`UI broadcast failed: ${(err as Error).message}`);
    }
  }

  private historyFor(userId: string): StoredNotification[] {
    return this.dbs.notificationHistoryDB.get(userId)?.items ?? [];
  }

  private async putHistory(userId: string, items: StoredNotification[]): Promise<void> {
    await this.dbs.notificationHistoryDB.put(userId, { _id: userId, items });
  }
}

function parseHHmm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}
