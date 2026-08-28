import { PluginInterface } from '@camera.ui/sdk';
import { container } from 'tsyringe';

import { PluginsService } from '../api/services/plugins.service.js';
import { NamespaceManager } from '../rpc/namespaces.js';

import type { DiscoveredSensor } from '@camera.ui/sdk';
import type { Plugin } from '../plugins/plugin.js';
import type { ProxyServer } from '../rpc/index.js';
import type { DiscoveredSensorListItem, SensorDiscoveryEvents, SensorDiscoveryGenericEvent } from '../rpc/interfaces/sensor.js';
import type { LoggerService } from '../services/logger/index.js';
import type { SensorRegistry } from './registry.js';

const MIN_SCAN_INTERVAL_MS = 30_000;
const AUTO_RESCAN_INTERVAL_MS = 60_000;

export class SensorDiscoveryManager {
  private registry: SensorRegistry;
  private proxyServer: ProxyServer;
  private logger: LoggerService;
  private pluginsService = new PluginsService();

  private cache = new Map<string, DiscoveredSensorListItem[]>();
  private isScanning = false;
  private subscriberCount = 0;
  private lastScanCompletedAt = 0;
  private autoRescanTimer?: NodeJS.Timeout;

  private namespaces = NamespaceManager.sensorDiscoveryNamespaces();

  constructor() {
    this.registry = container.resolve<SensorRegistry>('sensorRegistry');
    this.proxyServer = container.resolve<ProxyServer>('proxy');
    this.logger = container.resolve<LoggerService>('logger');
  }

  public subscribe(): DiscoveredSensorListItem[] {
    const isFirstSubscriber = this.subscriberCount === 0;
    this.subscriberCount++;

    if (isFirstSubscriber) {
      this.startAutoRescanTimer();
    }

    const cacheIsFresh = this.lastScanCompletedAt > 0 && Date.now() - this.lastScanCompletedAt < MIN_SCAN_INTERVAL_MS;
    if (!this.isScanning && !cacheIsFresh) {
      this.scan();
    }

    return this.list();
  }

  public unsubscribe(): void {
    this.subscriberCount = Math.max(0, this.subscriberCount - 1);

    if (this.subscriberCount === 0) {
      this.stopAutoRescanTimer();
    }
  }

  public isScanningNow(): boolean {
    return this.isScanning;
  }

  public async forceRescan(): Promise<void> {
    this.cache.clear();
    this.lastScanCompletedAt = 0;
    await this.scan();
  }

  public async adopt(pluginId: string, sensor: DiscoveredSensor): Promise<void> {
    const plugin = this.pluginsService.getPluginById(pluginId);
    if (!plugin || !this.isSensorDiscoveryPlugin(plugin) || !plugin.worker?.isRunning()) {
      throw new Error('Plugin not found or not running');
    }

    await plugin.worker.pluginProxy.onAdoptSensor?.(sensor);

    const items = this.cache.get(pluginId);
    if (items) {
      this.cache.set(
        pluginId,
        items.filter((item) => item.id !== sensor.id),
      );
    }
    this.publish('sensors:adopted', { pluginId, id: sensor.id });
  }

  public async scan(): Promise<void> {
    if (this.isScanning) return;

    this.isScanning = true;
    this.publish('sensors:scanning', { isScanning: true });

    try {
      const providers = this.pluginsService.listPlugins().filter((plugin) => this.isSensorDiscoveryPlugin(plugin) && plugin.worker?.isRunning());

      await Promise.all(
        providers.map(async (plugin) => {
          try {
            const sensors = (await plugin.worker.pluginProxy.onDiscoverSensors?.()) ?? [];
            await this.dropStaleRecords(plugin.id, sensors);
            const items = sensors.map((sensor): DiscoveredSensorListItem => ({ ...sensor, pluginId: plugin.id, pluginName: plugin.contract.name }));
            this.cache.set(plugin.id, items);
            // per plugin as each answers, an empty list clears its entries
            this.publish('sensors:discovered', { sensors: items, source: plugin.id });
          } catch (error) {
            // plugin busy or not answering, its last-known entries stay
            this.logger.debug(`[SensorDiscovery] Scan failed for ${plugin.pluginName}:`, error);
          }
        }),
      );

      const active = new Set(providers.map((plugin) => plugin.id));
      for (const pluginId of [...this.cache.keys()]) {
        if (!active.has(pluginId)) {
          this.cache.delete(pluginId);
          this.publish('sensors:discovered', { sensors: [], source: pluginId });
        }
      }
    } finally {
      this.isScanning = false;
      this.lastScanCompletedAt = Date.now();
      this.publish('sensors:scanning', { isScanning: false });
    }
  }

  public destroy(): void {
    this.stopAutoRescanTimer();
    this.cache.clear();
  }

  private list(): DiscoveredSensorListItem[] {
    return [...this.cache.values()].flat();
  }

  private isSensorDiscoveryPlugin(plugin: Plugin): boolean {
    return plugin.contract.interfaces.includes(PluginInterface.SensorDiscovery);
  }

  private async dropStaleRecords(pluginId: string, sensors: DiscoveredSensor[]): Promise<void> {
    if (sensors.length === 0) return;
    const offered = new Set(sensors.map((sensor) => sensor.id));
    for (const record of this.registry.getRecords()) {
      if (record.pluginInfo.id !== pluginId) continue;
      if (!record.nativeId || !offered.has(record.nativeId)) continue;
      if (this.registry.isConnected(record._id)) continue;
      try {
        await this.registry.deleteSensor(record._id);
      } catch {
        // raced a re-registration, the record is live again and stays
      }
    }
  }

  private publish<K extends keyof SensorDiscoveryEvents>(type: K, data: SensorDiscoveryEvents[K]): void {
    const event: SensorDiscoveryGenericEvent<K> = { type, data };
    this.proxyServer.proxy.publish(this.namespaces.sensorDiscoverySubject, event);
  }

  private startAutoRescanTimer(): void {
    this.stopAutoRescanTimer();
    this.autoRescanTimer = setInterval(() => {
      if (!this.isScanning) {
        this.scan();
      }
    }, AUTO_RESCAN_INTERVAL_MS);
  }

  private stopAutoRescanTimer(): void {
    if (this.autoRescanTimer) {
      clearInterval(this.autoRescanTimer);
      this.autoRescanTimer = undefined;
    }
  }
}

let instance: SensorDiscoveryManager | undefined;

export function getSensorDiscovery(): SensorDiscoveryManager {
  instance ??= new SensorDiscoveryManager();
  return instance;
}
