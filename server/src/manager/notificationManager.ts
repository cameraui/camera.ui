import { uuidv4 } from '@camera.ui/common/utils';
import { hasCapability, PluginCapability, Severity } from '@camera.ui/sdk';
import { copyFile, mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { NotificationsService } from '../api/services/notifications.service.js';
import { PluginsService } from '../api/services/plugins.service.js';
import { RemoteService } from '../api/services/remote.service.js';
import { UsersService } from '../api/services/users.service.js';
import { inject } from '../container.js';
import { t } from '../i18n/index.js';
import { emitInternalEvent } from '../internal-bus.js';
import { NamespaceManager } from '../rpc/namespaces.js';
import { NotificationStore } from './notificationStore.js';
import { burstMessages, PluginLogBursts } from './pluginLogBursts.js';
import { notificationBucket, notificationCameraId, notificationPluginId, SYSTEM_NOTIFICATION_TYPES, SystemNotificationTypeId } from './types.js';

import type { LogEntry } from '@camera.ui/common/logger';
import type { Promisify } from '@camera.ui/rpc';
import type { Notification, NotifierDevice, NotifierInterface, PluginInterface } from '@camera.ui/sdk';
import type { Database } from '../api/database/index.js';
import type { DBNotificationEntry, DBRoles, NotificationLogBurst, StoredNotification } from '../api/database/types.js';
import type { NotificationFilter, NotificationListQueryInput } from '../api/schemas/notifications.schema.js';
import type { NotificationPage, NotificationSourceCount } from '../api/types/index.js';
import type { InternalEventBus, InternalEventPayload, PluginEventPayload } from '../internal-bus.js';
import type { Plugin } from '../plugins/plugin.js';
import type { ProxyServer } from '../rpc/index.js';
import type { NotifyResult } from '../rpc/interfaces/notification.js';
import type { LoggerService } from '../services/logger/index.js';
import type { NotificationChange, NotificationSourceTally } from './notificationStore.js';
import type { PluginLogBurst } from './pluginLogBursts.js';
import type { NotificationSource, NotifierDeviceWithSource, NotifyOptions, ResolvedNotification, SourcesListing } from './types.js';

type NotifierProxy = Promisify<NotifierInterface>;

interface PublishEnvelope {
  pluginId: string;
  pluginName: string;
  notification: Notification;
}

interface TargetDevice {
  pluginName: string;
  proxy: NotifierProxy;
  device: NotifierDevice;
}

interface FloodWindow {
  start: number;
  count: number;
  source: NotificationSource;
  data?: Record<string, string>;
  timer?: NodeJS.Timeout;
}

interface ListOnlyNotification {
  id?: string;
  createdAt?: number;
  title: string;
  body?: string;
  severity: Severity;
  tag?: string;
  source: NotificationSource;
  data?: Record<string, string>;
  log?: NotificationLogBurst;
}

const FLOOD_WINDOW = 60_000;
const FLOOD_LIMIT = 30;

export class DeviceForbiddenError extends Error {}

export class NotificationManager {
  private proxyServer: ProxyServer;
  private logger: LoggerService;
  private dbs: Database;
  private notificationsService: NotificationsService;
  private pluginsService: PluginsService;
  private remoteService: RemoteService;
  private usersService: UsersService;
  private store: NotificationStore;
  private logBursts: PluginLogBursts;
  private bus: InternalEventBus;

  private floods = new Map<string, FloodWindow>();
  private onPluginStarted = (payload: InternalEventPayload) => this.logBursts.end((payload as PluginEventPayload).pluginId);
  private closePublishUnsub?: () => void;
  private imagesDir: string;

  constructor() {
    this.proxyServer = inject('proxy');
    this.logger = inject('logger');
    this.dbs = inject('dbs');
    this.notificationsService = new NotificationsService();
    this.pluginsService = new PluginsService();
    this.remoteService = new RemoteService();
    this.usersService = new UsersService();
    this.store = new NotificationStore();
    this.logBursts = new PluginLogBursts((burst, create) => this.flushBurst(burst, create));
    this.bus = inject('internalBus');
    this.bus.onEvent('plugin:started', this.onPluginStarted);
    this.imagesDir = join(inject('configService').STORAGE_PATH, 'notification-images');
  }

  public async register(): Promise<void> {
    this.store.load();
    await this.subscribePublishTopic();
    await mkdir(this.imagesDir, { recursive: true }).catch(() => {});
    this.pruneOrphanImages().catch(() => {});
  }

  public async destroy(): Promise<void> {
    this.closePublishUnsub?.();
    this.bus.offEvent('plugin:started', this.onPluginStarted);
    this.logBursts.destroy();
    for (const flood of this.floods.values()) clearTimeout(flood.timer);
    this.floods.clear();
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

  public page(userId: string, query: NotificationListQueryInput): NotificationPage {
    const q = query.q?.toLowerCase();
    const matches = q ? (entry: DBNotificationEntry) => this.searchTexts(entry).some((text) => text?.toLowerCase().includes(q)) : undefined;
    const page = this.store.page(userId, { cursor: query.cursor, limit: query.limit, filter: query.filter, source: query.source, matches });
    const sources = query.cursor ? undefined : this.sources(userId, query.filter, matches);
    return { ...page, items: page.items.map((item) => this.named(item)), sources };
  }

  public getEntry(userId: string, id: string): StoredNotification | undefined {
    const entry = this.store.visible(userId, id);
    return entry && this.named(this.store.view(entry, userId));
  }

  public getHistory(userId: string): StoredNotification[] {
    return this.store.legacy(userId);
  }

  public getImagePath(userId: string, id: string): string | null {
    return this.store.visible(userId, id) ? join(this.imagesDir, `${id}.img`) : null;
  }

  public getVideoPath(userId: string, id: string): string | null {
    return this.store.visible(userId, id) ? join(this.imagesDir, `${id}.vid`) : null;
  }

  public unreadCount(userId: string): number {
    return this.store.unreadCount(userId);
  }

  public async remove(userId: string, ids?: string[]): Promise<void> {
    await this.applyChange(await this.store.hide(userId, ids));
  }

  public async removeByTagForAll(tag: string): Promise<void> {
    await this.applyChange(await this.store.removeTag(tag));
  }

  public async markSeen(userId: string, ids?: string[]): Promise<void> {
    const changed = await this.store.setSeen(userId, true, ids);
    if (!changed.length) return;

    this.emitToUser(userId, 'seen', { at: changed[0].seenBy[userId], ids: ids && changed.map((entry) => entry.id) });
    this.emitUnread(userId);
    this.publishLegacyHistory(userId);
  }

  public async markUnseen(userId: string, id: string): Promise<void> {
    const [entry] = await this.store.setSeen(userId, false, [id]);
    if (!entry) return;

    this.emitToUser(userId, 'updated', this.named(this.store.view(entry, userId)));
    this.emitUnread(userId);
    this.publishLegacyHistory(userId);
  }

  public notePluginLog(pluginId: string, entry: LogEntry): void {
    const severity = entry.level === 'error' ? Severity.Error : entry.level === 'warn' ? Severity.Warn : undefined;
    if (!severity) return;

    const cameraId = entry.targetType === 'camera' && entry.targetId && this.dbs.camerasDB.get(entry.targetId) ? entry.targetId : undefined;
    this.logBursts.note(pluginId, cameraId, severity, entry.message, entry.timestamp);
  }

  public async notify(opts: NotifyOptions): Promise<NotifyResult[]> {
    const { source, targets } = opts;

    const plugin = source.kind === 'plugin' ? this.pluginsService.getPluginById(source.id) : undefined;
    if (source.kind === 'plugin') {
      if (!plugin) {
        this.logger.warn(`notify: plugin "${source.id}" not found, dropping`);
        return [];
      }
      if (!hasCapability(plugin.contract, PluginCapability.PublishNotifications)) {
        this.logger.error(`Plugin "${plugin.pluginName}" called Publish() without "publishNotifications" capability — declare it in your contract.`);
        return [];
      }
    }

    // a push to chosen devices lands only in the lists of their owners
    const targetDevices = targets?.length ? await this.findTargetDevices(targets) : undefined;
    const userIds = targetDevices
      ? [...new Set(Array.from(targetDevices.values(), (target) => target.device.ownerUserId))]
      : await this.findRecipientUserIds(source, opts.notification.adminOnly ?? false);
    if (userIds.length === 0) return [];

    // one id and createdAt for UI and push, so client dedup matches across channels
    const cloud = this.remoteService.getCloud();
    const originData: Record<string, string> = {};

    if (cloud.oauth?.server_id) originData.originServerId = cloud.oauth.server_id;
    if (cloud.name) originData.originName = cloud.name;

    const resolved: ResolvedNotification = {
      ...opts.notification,
      severity: opts.notification.severity ?? Severity.Info,
      silent: opts.notification.severity === Severity.Critical ? false : opts.notification.silent,
      id: uuidv4(),
      createdAt: Date.now(),
      source,
      data: { ...opts.notification.data, ...originData },
    };

    if (!this.admitted(resolved)) return [];

    if (source.kind === 'system') {
      emitInternalEvent('system:notification', {
        typeId: source.id,
        title: resolved.title,
        body: resolved.body,
        severity: String(resolved.severity),
      });
    } else if (source.kind === 'plugin' && plugin) {
      emitInternalEvent('plugin:notification', {
        ...resolved.data,
        pluginId: source.id,
        pluginName: plugin.pluginName,
        title: resolved.title,
        subtitle: resolved.subtitle,
        body: resolved.body,
        severity: String(resolved.severity),
        tag: resolved.tag,
      });
    }

    const globalSuppressed = this.isGloballySuppressed();
    const cameraSuppressed = this.isCameraSuppressed(resolved.data?.cameraId);
    const recipients: string[] = [];
    const eligibleUserIds: string[] = [];
    for (const userId of userIds) {
      const settings = await this.notificationsService.getSettings(userId);
      if (!settings.enabled) continue;
      if (source.kind === 'plugin' && settings.sources?.[source.id] === false) continue;
      if (source.kind === 'system' && settings.systemTypes?.[source.id] === false) continue;

      // suppression mutes push and sound, not the list entry
      recipients.push(userId);

      if (resolved.severity !== Severity.Critical && (globalSuppressed || cameraSuppressed || settings.suppressed || this.inQuietHours(settings))) continue;

      eligibleUserIds.push(userId);
    }

    if (recipients.length) await this.addEntry(await this.buildEntry(resolved, recipients));

    // a tap on a push without a deep link opens this entry in the app
    const pushed: ResolvedNotification = { ...resolved, data: { ...resolved.data, notificationId: resolved.id } };

    if (targets && targetDevices) {
      return Promise.all(
        targets.map(async (deviceId): Promise<NotifyResult> => {
          const target = targetDevices.get(deviceId);
          if (!target) return { pluginName: '', deviceId, ok: false, error: 'device not found' };
          const [result] = await this.dispatchBatch(target.pluginName, target.proxy, [deviceId], pushed);
          return result;
        }),
      );
    }

    if (eligibleUserIds.length === 0) return [];

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
        tasks.push(this.dispatchBatch(plugin.pluginName, proxy, deviceIds, pushed));
      }
    }

    return (await Promise.all(tasks)).flat();
  }

  public isGloballySuppressed(): boolean {
    return this.dbs.settingsDB.get('settings')?.notificationsSuppressed === true;
  }

  public async setGlobalSuppressed(suppressed: boolean): Promise<void> {
    await this.dbs.commit(this.dbs.settingsDB, 'settings', (current) => (current ? { ...current, notificationsSuppressed: suppressed } : undefined));
  }

  public async setUserSuppressed(userId: string, suppressed: boolean): Promise<void> {
    await this.notificationsService.patchSettings(userId, { suppressed });
  }

  public isCameraSuppressed(cameraId: string | undefined): boolean {
    if (!cameraId) return false;
    return this.dbs.settingsDB.get('settings')?.notificationsMutedCameras?.includes(cameraId) === true;
  }

  public async setCameraSuppressed(cameraId: string, suppressed: boolean): Promise<void> {
    await this.dbs.commit(this.dbs.settingsDB, 'settings', (current) => {
      if (!current) return undefined;
      const muted = new Set(current.notificationsMutedCameras ?? []);
      if (suppressed) muted.add(cameraId);
      else muted.delete(cameraId);
      return { ...current, notificationsMutedCameras: [...muted] };
    });
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
        // unknown ids can throw
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

  private async findTargetDevices(deviceIds: string[]): Promise<Map<string, TargetDevice>> {
    const found = new Map<string, TargetDevice>();
    for (const plugin of this.getNotifierPlugins()) {
      const proxy = this.getProxyFor(plugin);
      for (const deviceId of deviceIds) {
        if (found.has(deviceId)) continue;
        try {
          const device = await proxy.getDevice(deviceId);
          if (device) found.set(deviceId, { pluginName: plugin.pluginName, proxy, device });
        } catch {
          // unknown ids can throw
        }
      }
    }
    return found;
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
        // not awaited, a slow notify must not hold up the nats consumer
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

  private admitted(n: ResolvedNotification): boolean {
    if (n.source.kind === 'system') return true;

    const bucket = notificationBucket(n);
    const now = Date.now();
    let flood = this.floods.get(bucket);
    if (!flood || now - flood.start >= FLOOD_WINDOW) {
      if (flood?.timer) this.reportFlood(bucket, flood);
      flood = { start: now, count: 0, source: n.source, data: n.data };
      this.floods.set(bucket, flood);
    }

    flood.count++;
    if (flood.count <= FLOOD_LIMIT) return true;

    const window = flood;
    flood.timer ??= setTimeout(() => this.reportFlood(bucket, window), flood.start + FLOOD_WINDOW - now);
    return false;
  }

  private reportFlood(bucket: string, flood: FloodWindow): void {
    clearTimeout(flood.timer);
    if (this.floods.get(bucket) === flood) this.floods.delete(bucket);

    const held = flood.count - FLOOD_LIMIT;
    const pluginId = notificationPluginId(flood);
    const cameraId = notificationCameraId(flood);
    const name =
      flood.source.kind === 'automation'
        ? (this.dbs.automationsDB.get(flood.source.id)?.name ?? flood.source.id)
        : (this.pluginsService.getPluginById(pluginId ?? '')?.displayName ?? pluginId ?? flood.source.id);

    this.addListOnly({
      title: t('notifications.flood_title', { source: name, count: flood.count }),
      body: held === 1 ? t('notifications.flood_held_one') : t('notifications.flood_held', { count: held }),
      severity: Severity.Warn,
      source: flood.source.kind === 'automation' ? flood.source : { kind: 'system', id: SystemNotificationTypeId.PluginErrors },
      data: {
        ...(pluginId && { pluginId }),
        ...(cameraId && { cameraId }),
        ...(flood.data?.cameraName && { cameraName: flood.data.cameraName }),
      },
    }).catch((err) => {
      this.logger.warn(`Flood notice for "${name}" failed: ${(err as Error).message}`);
    });
  }

  private async flushBurst(burst: PluginLogBurst, create: boolean): Promise<boolean> {
    const messages = burstMessages(burst);
    const log: NotificationLogBurst = { count: burst.count, lastAt: burst.lastAt, messages };
    const cameraName = burst.cameraId ? this.dbs.camerasDB.get(burst.cameraId)?.name : undefined;
    const title = cameraName ?? this.pluginsService.getPluginById(burst.pluginId)?.displayName ?? burst.pluginId;

    if (create) {
      await this.addListOnly({
        id: burst.id,
        createdAt: burst.startedAt,
        title,
        body: messages[0].text,
        severity: burst.severity,
        tag: `${SystemNotificationTypeId.PluginErrors}:${burst.cameraId ?? burst.pluginId}:${burst.startedAt}`,
        source: { kind: 'system', id: SystemNotificationTypeId.PluginErrors },
        data: { pluginId: burst.pluginId, ...(burst.cameraId && { cameraId: burst.cameraId }), ...(cameraName && { cameraName }) },
        log,
      });
      return true;
    }

    const entry = await this.store.update(burst.id, (current) => {
      // a repeat stays read, a new message or a warning turning into an error asks for attention again
      const fresh = messages.length > (current.log?.messages.length ?? 0) || (burst.severity === Severity.Error && current.severity !== Severity.Error);
      if (fresh) current.seenBy = {};
      current.title = title;
      current.body = messages[0].text;
      current.severity = burst.severity;
      current.log = log;
    });
    if (!entry) return false;

    for (const userId of entry.recipients) {
      this.emitToUser(userId, 'updated', this.named(this.store.view(entry, userId)));
      this.emitUnread(userId);
    }
    return true;
  }

  private async addListOnly(n: ListOnlyNotification): Promise<void> {
    const recipients: string[] = [];
    for (const userId of await this.findRecipientUserIds(n.source, true)) {
      if ((await this.notificationsService.getSettings(userId)).enabled) recipients.push(userId);
    }
    if (!recipients.length) return;

    await this.addEntry({
      id: n.id ?? uuidv4(),
      createdAt: n.createdAt ?? Date.now(),
      title: n.title,
      body: n.body,
      severity: n.severity,
      tag: n.tag,
      source: n.source,
      data: n.data,
      log: n.log,
      listOnly: true,
      bucket: notificationBucket(n),
      recipients,
      seenBy: {},
    });
  }

  private async buildEntry(n: ResolvedNotification, recipients: string[]): Promise<DBNotificationEntry> {
    return {
      id: n.id,
      createdAt: n.createdAt,
      title: n.title,
      subtitle: n.subtitle,
      body: n.body,
      severity: n.severity,
      tag: n.tag,
      imageUrl: (await this.persistImage(n.id, n.imageUrl)) ?? (await this.persistThumbnail(n.id, n.thumbnail)),
      videoUrl: await this.persistVideo(n.id, n.videoUrl),
      deepLink: n.deepLink,
      source: n.source,
      data: n.data,
      silent: n.silent,
      bucket: notificationBucket(n),
      recipients,
      seenBy: {},
    };
  }

  private async addEntry(entry: DBNotificationEntry): Promise<void> {
    const change = await this.store.insert(entry);

    for (const userId of entry.recipients) {
      const view = this.named(this.store.view(entry, userId));
      this.emitToUser(userId, 'added', view);
      if (!entry.listOnly) this.publishLegacy(userId, 'notification', view);
    }
    await this.applyChange(change, entry.recipients);
  }

  private async applyChange(change: NotificationChange, notified: string[] = []): Promise<void> {
    for (const [userId, ids] of change.removed) {
      this.emitToUser(userId, 'removed', { ids });
      this.publishLegacyHistory(userId);
    }
    for (const userId of new Set([...notified, ...change.removed.keys()])) {
      this.emitUnread(userId);
    }
    await this.dropMedia(change.dropped);
  }

  private named(item: StoredNotification): StoredNotification {
    const pluginId = notificationPluginId(item);
    const cameraId = notificationCameraId(item);
    return {
      ...item,
      sourceName:
        item.source.kind === 'automation' ? this.dbs.automationsDB.get(item.source.id)?.name : pluginId && this.pluginsService.getPluginById(pluginId)?.displayName,
      cameraName: cameraId && this.dbs.camerasDB.get(cameraId)?.name,
    };
  }

  private sources(userId: string, filter: NotificationFilter, matches?: (entry: DBNotificationEntry) => boolean): NotificationSourceCount[] | undefined {
    if (filter !== 'cameras' && filter !== 'plugins') return undefined;
    const sources = Array.from(this.store.bySource(userId, filter, matches), ([id, tally]) => ({ id, name: this.sourceName(id, tally), count: tally.count }));
    return sources.sort((a, b) => a.name.localeCompare(b.name));
  }

  private sourceName(id: string, { latest }: NotificationSourceTally): string {
    const stored = latest.data?.cameraName;
    if (notificationCameraId(latest)) return this.dbs.camerasDB.get(id)?.name ?? (typeof stored === 'string' ? stored : id);
    return this.pluginsService.getPluginById(id)?.displayName ?? id;
  }

  private searchTexts(entry: DBNotificationEntry): (string | undefined)[] {
    const pluginId = notificationPluginId(entry);
    const cameraName = entry.data?.cameraName;
    return [
      entry.title,
      entry.subtitle,
      entry.body,
      typeof cameraName === 'string' ? cameraName : undefined,
      pluginId ? this.pluginsService.getPluginById(pluginId)?.displayName : undefined,
      entry.source.kind === 'automation' ? this.dbs.automationsDB.get(entry.source.id)?.name : undefined,
      ...(entry.log?.messages.map((message) => message.text) ?? []),
    ];
  }

  private emitToUser(userId: string, event: string, payload: unknown): void {
    try {
      const socketService = inject('socketService');
      socketService.io.of('/notifications').to(`user:${userId}`).emit(event, payload);
    } catch (err) {
      this.logger.warn(`UI broadcast failed: ${(err as Error).message}`);
    }
    this.proxyServer.proxy.publish(`notifications.user.${userId}`, { event, payload }).catch(() => {});
  }

  private emitUnread(userId: string): void {
    this.emitToUser(userId, 'unread', this.store.unreadCount(userId));
  }

  private publishLegacyHistory(userId: string): void {
    this.publishLegacy(userId, 'history', this.store.legacy(userId));
  }

  private publishLegacy(userId: string, event: 'notification' | 'history', payload: unknown): void {
    this.proxyServer.proxy.publish(`notifications.user.${userId}`, { event, payload }).catch(() => {});
  }

  private async persistImage(id: string, imageUrl?: string): Promise<string | undefined> {
    if (!imageUrl) return undefined;
    const token = /\/api\/download\/([0-9a-f-]+)/i.exec(imageUrl)?.[1];
    const filePath = token ? this.proxyServer.downloadManager.resolveLocalFile(token) : null;
    if (!filePath) return imageUrl;
    try {
      await copyFile(filePath, join(this.imagesDir, `${id}.img`));
      return `/api/notifications/history/${id}/image`;
    } catch {
      return imageUrl;
    }
  }

  private async persistThumbnail(id: string, thumbnail?: Uint8Array): Promise<string | undefined> {
    if (!thumbnail?.byteLength) return undefined;
    try {
      await writeFile(join(this.imagesDir, `${id}.img`), thumbnail);
      return `/api/notifications/history/${id}/image`;
    } catch {
      return undefined;
    }
  }

  private async persistVideo(id: string, videoUrl?: string): Promise<string | undefined> {
    if (!videoUrl) return undefined;
    const token = /\/api\/download\/([0-9a-f-]+)/i.exec(videoUrl)?.[1];
    const filePath = token ? this.proxyServer.downloadManager.resolveLocalFile(token) : null;
    if (!filePath) return undefined;
    try {
      await copyFile(filePath, join(this.imagesDir, `${id}.vid`));
      return `/api/notifications/history/${id}/video`;
    } catch {
      return undefined;
    }
  }

  private async dropMedia(ids: string[]): Promise<void> {
    for (const id of ids) {
      await unlink(join(this.imagesDir, `${id}.img`)).catch(() => {});
      await unlink(join(this.imagesDir, `${id}.vid`)).catch(() => {});
    }
  }

  private async pruneOrphanImages(): Promise<void> {
    const files = await readdir(this.imagesDir).catch(() => [] as string[]);
    if (files.length === 0) return;
    const referenced = this.store.ids();
    for (const file of files) {
      if (referenced.has(file.replace(/\.(img|vid)$/, ''))) continue;
      await unlink(join(this.imagesDir, file)).catch(() => {});
    }
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
