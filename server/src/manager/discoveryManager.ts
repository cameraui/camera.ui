import { RPCClass, RPCMethod } from '@camera.ui/rpc';
import { isDiscoveryProvider } from '@camera.ui/sdk/internal';
import { TTLCache } from '@isaacs/ttlcache';
import { container } from 'tsyringe';

import { createCameraSchema } from '../api/schemas/cameras.schema.js';
import { CamerasService } from '../api/services/cameras.service.js';
import { PluginsService } from '../api/services/plugins.service.js';
import { NamespaceManager } from '../rpc/namespaces.js';

import type { DiscoveredCamera, JsonSchemaWithoutCallbacks } from '@camera.ui/sdk';
import type { CameraUiAPI } from '../api.js';
import type { DBCamera } from '../api/database/types.js';
import type { Go2RtcApi } from '../go2rtc/api/index.js';
import type { DeviceSource, OnvifSource } from '../go2rtc/types.js';
import type { Plugin } from '../plugins/plugin.js';
import type { ProxyServer } from '../rpc/index.js';
import type {
  DeviceListItem,
  DeviceStatus,
  DiscoveryManagerInterface,
  DiscoveryManagerProxyEvents,
  DiscoveryManagerProxyGenericEvent,
} from '../rpc/interfaces/discovery.js';
import type { ConfigService } from '../services/config/index.js';
import type { LoggerService } from '../services/logger/index.js';

const DISCOVERED_CACHE_TTL_MS = 300_000;
const MIN_SCAN_INTERVAL_MS = 30_000;
const AUTO_RESCAN_INTERVAL_MS = 60_000;

interface ConnectionState {
  status: 'idle' | 'connecting' | 'connected' | 'error';
  errorMessage?: string;
}

interface SourceCacheEntry {
  // 'go2rtc', 'database', or 'plugin-{pluginId}'
  sourceId: string;
  cameras: DiscoveredCameraInternal[];
  lastScannedAt: number;
  scanDurationMs: number;
  error?: string;
}

interface DiscoveredCameraInternal extends DiscoveredCamera {
  provider: string;
  address?: string;
  _internalAddress?: string;
  _originalUrl?: string;
}

interface AdoptResult {
  cameraId: string;
  cameraName: string;
}

@RPCClass
export class DiscoveryManager implements DiscoveryManagerInterface {
  private api: CameraUiAPI;
  private proxyServer: ProxyServer;
  private pluginsService: PluginsService;
  private camerasService: CamerasService;
  private configService: ConfigService;
  private go2rtcApi: Go2RtcApi;
  private logger: LoggerService;

  private discoveredCamerasCache = new TTLCache<string, DiscoveredCameraInternal>({
    ttl: DISCOVERED_CACHE_TTL_MS,
    max: 500,
  });

  private sourceCache = new Map<string, SourceCacheEntry>();
  private isScanning = false;
  private connectionStates = new Map<string, ConnectionState>();
  private subscriberCount = 0;
  private scannedCameraIds = new Set<string>();
  private initialScanLogged = false;
  private lastScanCompletedAt = 0;
  private autoRescanTimer?: NodeJS.Timeout;

  private namespaces = NamespaceManager.discoveryManagerNamespaces();
  private closeProxy?: () => Promise<void>;

  constructor() {
    this.api = container.resolve<CameraUiAPI>('api');
    this.proxyServer = container.resolve<ProxyServer>('proxy');
    this.go2rtcApi = container.resolve<Go2RtcApi>('go2rtcApi');
    this.logger = container.resolve<LoggerService>('logger');
    this.configService = container.resolve<ConfigService>('configService');
    this.pluginsService = new PluginsService();
    this.camerasService = new CamerasService();
  }

  public async register(): Promise<void> {
    this.closeProxy = await this.proxyServer.proxy.registerHandler(this.namespaces.discoveryManagerRpc, this);
  }

  public async destroy(): Promise<void> {
    this.stopAutoRescanTimer();
    this.discoveredCamerasCache.clear();
    this.sourceCache.clear();
    this.connectionStates.clear();
    this.scannedCameraIds.clear();
    await this.closeProxy?.();
  }

  public subscribe(): DeviceListItem[] {
    const isFirstSubscriber = this.subscriberCount === 0;
    this.subscriberCount++;

    if (isFirstSubscriber) {
      this.startAutoRescanTimer();
    }

    const cachedDevices = this.mergeResults();

    const timeSinceLastScan = Date.now() - this.lastScanCompletedAt;
    const hasCachedDiscoveredDevices = this.sourceCache.size > 0;
    const cacheIsFresh = hasCachedDiscoveredDevices && timeSinceLastScan < MIN_SCAN_INTERVAL_MS;

    if (!this.isScanning && !cacheIsFresh) {
      this.discoverCameras();
    }

    return cachedDevices;
  }

  public isScanningNow(): boolean {
    return this.isScanning;
  }

  public unsubscribe(): void {
    this.subscriberCount = Math.max(0, this.subscriberCount - 1);

    if (this.subscriberCount === 0) {
      this.stopAutoRescanTimer();
    }
  }

  public getSubscriberCount(): number {
    return this.subscriberCount;
  }

  private startAutoRescanTimer(): void {
    this.stopAutoRescanTimer();

    this.autoRescanTimer = setInterval(() => {
      if (this.subscriberCount > 0 && !this.isScanning) {
        this.logger.debug('[Discovery] Auto-rescan triggered');
        this.discoverCameras();
      }
    }, AUTO_RESCAN_INTERVAL_MS);
  }

  private stopAutoRescanTimer(): void {
    if (this.autoRescanTimer) {
      clearInterval(this.autoRescanTimer);
      this.autoRescanTimer = undefined;
    }
  }

  public async discoverCameras(): Promise<void> {
    if (this.isScanning) {
      this.logger.debug('[Discovery] Scan already in progress, skipping');
      return;
    }

    this.isScanning = true;
    this.scannedCameraIds.clear();
    this.broadcastScanningStatus(true);

    try {
      // Send DB cameras first so the user sees existing cameras while scans run.
      const dbDevices = this.fetchDbCameras();
      if (dbDevices.length > 0) {
        this.broadcastDiscovered(dbDevices, 'database');
      }

      // Track manual-camera addresses so go2rtc duplicates can be filtered out.
      const manualCameraAddresses = new Set<string>();
      for (const device of dbDevices) {
        if (device.provider === 'camera.ui') {
          const address = this.extractAddressFromDbCamera(device);
          if (address) {
            manualCameraAddresses.add(address);
          }
        }
      }

      const discoveryPlugins = this.getDiscoveryPlugins();
      const sources = ['go2rtc', ...discoveryPlugins.map((p) => `plugin-${p.id}`)];

      await Promise.all(
        sources.map(async (sourceId) => {
          try {
            let cameras: DiscoveredCameraInternal[];

            if (sourceId === 'go2rtc') {
              cameras = await this.fetchGo2rtcCameras();
              cameras = cameras.filter((c) => {
                if (c._internalAddress && manualCameraAddresses.has(c._internalAddress)) {
                  return false;
                }
                return true;
              });
            } else {
              const pluginId = sourceId.replace('plugin-', '');
              cameras = await this.fetchPluginCameras(pluginId);
            }

            const uniqueCameras = cameras.filter((c) => {
              if (this.scannedCameraIds.has(c.id)) {
                return false;
              }
              this.scannedCameraIds.add(c.id);
              return true;
            });

            if (uniqueCameras.length > 0) {
              this.updateSourceCache(sourceId, uniqueCameras);

              const devices = uniqueCameras.map((c) => this.toDeviceListItem(c));
              this.broadcastDiscovered(devices, sourceId);
            } else {
              this.updateSourceCache(sourceId, []);
            }
          } catch (error) {
            this.logger.debug(`[Discovery] Scan failed for ${sourceId}:`, error);
            // Preserve last-known cameras on error so we don't drop entries from the UI.
            this.updateSourceCache(sourceId, this.sourceCache.get(sourceId)?.cameras ?? [], error instanceof Error ? error.message : 'Unknown error');
          }
        }),
      );

      this.cleanupOrphanedCameras(new Set(['database', ...sources]));

      this.logDiscoverySummary();
    } finally {
      this.isScanning = false;
      this.lastScanCompletedAt = Date.now();
      this.broadcastScanningStatus(false);
    }
  }

  public async forceRescan(): Promise<void> {
    this.sourceCache.clear();
    this.discoveredCamerasCache.clear();
    this.initialScanLogged = false;
    this.lastScanCompletedAt = 0;

    await this.discoverCameras();
  }

  public async getCameraSettings(discoveredId: string): Promise<JsonSchemaWithoutCallbacks[]> {
    if (discoveredId.startsWith('go2rtc:')) {
      return this.getGo2rtcCameraSettings(discoveredId);
    }

    const { plugin, camera } = this.findDiscoveredCamera(discoveredId);
    if (plugin && camera) {
      if (!plugin.worker?.isRunning()) {
        throw new Error(`Plugin "${plugin.pluginName}" is not running`);
      }
      const result = await plugin.worker.pluginProxy.onGetCameraSettings?.(camera);
      return result ?? [];
    }

    throw new Error(`Camera "${discoveredId}" not found`);
  }

  public async adoptCamera(discoveredId: string, cameraSettings: Record<string, unknown>): Promise<AdoptResult> {
    const draft = await this.prepareCamera(discoveredId, cameraSettings);
    return this.confirmCamera(draft, discoveredId);
  }

  public async prepareCamera(discoveredId: string, cameraSettings: Record<string, unknown>): Promise<DBCamera> {
    this.setConnectionState(discoveredId, 'connecting');
    this.broadcastConnectionStatus(discoveredId);

    try {
      const draft = discoveredId.startsWith('go2rtc:')
        ? await this.prepareGo2rtcCamera(discoveredId, cameraSettings)
        : await this.preparePluginCamera(discoveredId, cameraSettings);

      this.setConnectionState(discoveredId, 'idle');
      this.broadcastConnectionStatus(discoveredId);

      return draft;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.setConnectionState(discoveredId, 'error', errorMessage);
      this.broadcastConnectionStatus(discoveredId);
      throw error;
    }
  }

  public async confirmCamera(draft: DBCamera, discoveredId?: string): Promise<AdoptResult> {
    if (discoveredId) {
      this.setConnectionState(discoveredId, 'connecting');
      this.broadcastConnectionStatus(discoveredId);
    }

    try {
      const validatedData = createCameraSchema.parse(draft);
      validatedData._id = draft._id;

      const dbCamera = await this.camerasService.createCamera(validatedData);

      const plugin = draft.pluginInfo?.id ? this.pluginsService.getPluginById(draft.pluginInfo.id) : null;
      if (plugin) {
        const pluginNamespaces = NamespaceManager.pluginNamespaces(plugin.id);
        const transformedCamera = this.camerasService.transformCamera(dbCamera);
        await this.proxyServer.proxy.publish(pluginNamespaces.pluginDeviceManagerSubject, {
          type: 'cameraAdded',
          data: { camera: transformedCamera },
        });
      }

      const newCameraDevice: DeviceListItem = {
        id: dbCamera._id,
        name: dbCamera.name,
        manufacturer: dbCamera.info?.manufacturer,
        model: dbCamera.info?.model,
        provider: plugin ? plugin.pluginName : 'camera.ui',
        room: dbCamera.room,
        status: 'added',
        type: 'camera',
        cameraId: dbCamera._id,
      };
      this.broadcastDiscovered([newCameraDevice], 'database');

      const result: AdoptResult = { cameraId: dbCamera._id, cameraName: dbCamera.name };

      if (discoveredId) {
        this.setConnectionState(discoveredId, 'connected');
        this.broadcastConnectionStatus(discoveredId);
        this.publishDiscoveryEvent('cameras:camera-connected', {
          discoveredId,
          cameraId: result.cameraId,
          cameraName: result.cameraName,
        });

        this.removeFromDiscoveredCache(discoveredId);
      }

      return result;
    } catch (error) {
      if (discoveredId) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.setConnectionState(discoveredId, 'error', errorMessage);
        this.broadcastConnectionStatus(discoveredId);
      }
      throw error;
    }
  }

  public async getConnectionSchema(discoveredId: string): Promise<JsonSchemaWithoutCallbacks[]> {
    return this.getCameraSettings(discoveredId);
  }

  public async connect(discoveredId: string, credentials: Record<string, unknown>): Promise<AdoptResult> {
    return this.adoptCamera(discoveredId, credentials);
  }

  // Plugin entry point for asynchronously discovered cameras (e.g., after cloud login).
  @RPCMethod
  public async pushDiscoveredCameras(pluginId: string, cameras: DiscoveredCamera[]): Promise<void> {
    const plugin = this.pluginsService.getPluginById(pluginId);
    if (!plugin) {
      throw new Error(`Plugin "${pluginId}" not found`);
    }

    if (!isDiscoveryProvider(plugin.contract)) {
      throw new Error(`Plugin "${plugin.pluginName}" is not a discovery provider`);
    }

    this.logger.log(`[Discovery] Received ${cameras.length} camera(s) from ${plugin.pluginName}`);

    const sourceId = `plugin-${pluginId}`;

    const internalCameras: DiscoveredCameraInternal[] = cameras.map((c) => ({
      ...c,
      provider: pluginId,
    }));

    this.updateSourceCache(sourceId, internalCameras);

    if (this.subscriberCount > 0) {
      const devices = internalCameras.map((c) => this.toDeviceListItem(c));
      this.broadcastDiscovered(devices, sourceId);
    }
  }

  public notifyCameraDeleted(cameraId: string, pluginId?: string): void {
    // Drop plugin's source cache so the next scan rediscovers the camera fresh.
    if (pluginId) {
      const sourceId = `plugin-${pluginId}`;
      this.sourceCache.delete(sourceId);
    }

    if (this.subscriberCount > 0) {
      this.publishDiscoveryEvent('cameras:deleted', { cameraId, pluginId });
    }
  }

  public notifyCameraUpdated(cameraId: string): void {
    const cc = this.api.getCameras().find((c) => c.id === cameraId);
    if (!cc) return;

    const hasPlugin = !!cc.pluginInfo?.id;
    const updatedDevice: DeviceListItem = {
      id: cc.id,
      name: cc.name,
      manufacturer: cc.info?.manufacturer,
      model: cc.info?.model,
      provider: hasPlugin ? (cc.pluginInfo?.name ?? 'camera.ui') : 'camera.ui',
      room: cc.room,
      status: 'added',
      type: 'camera',
      cameraId: cc.id,
    };

    if (this.subscriberCount > 0) {
      this.broadcastDiscovered([updatedDevice], 'database');
    }
  }

  private publishDiscoveryEvent<K extends keyof DiscoveryManagerProxyEvents>(type: K, data: DiscoveryManagerProxyEvents[K]): void {
    const event: DiscoveryManagerProxyGenericEvent<K> = { type, data };
    this.proxyServer.proxy.publish(this.namespaces.discoveryManagerSubject, event);
  }

  private getDiscoveryPlugins(): Plugin[] {
    return this.pluginsService.listPlugins().filter((plugin) => isDiscoveryProvider(plugin.contract) && plugin.worker?.isRunning());
  }

  private fetchDbCameras(): DeviceListItem[] {
    const cameraControllers = this.api.getCameras();
    const devices: DeviceListItem[] = [];

    for (const cc of cameraControllers) {
      const hasPlugin = !!cc.pluginInfo?.id;

      devices.push({
        id: cc.id,
        name: cc.name,
        manufacturer: cc.info?.manufacturer,
        model: cc.info?.model,
        provider: hasPlugin ? (cc.pluginInfo?.name ?? 'camera.ui') : 'camera.ui',
        room: cc.room,
        status: 'added',
        type: 'camera',
        cameraId: cc.id,
      });
    }

    return devices;
  }

  private async fetchGo2rtcCameras(): Promise<DiscoveredCameraInternal[]> {
    try {
      const { sources } = await this.go2rtcApi.discoverRoute.discoverSources();
      return this.convertGo2rtcSources(sources);
    } catch {
      return [];
    }
  }

  private async fetchPluginCameras(pluginId: string): Promise<DiscoveredCameraInternal[]> {
    const plugin = this.pluginsService.getPluginById(pluginId);

    if (!plugin?.worker?.isRunning()) {
      return [];
    }

    try {
      const cameras = await plugin.worker.pluginProxy.onDiscoverCameras?.();

      if (!cameras) {
        return [];
      }

      const result = cameras.map((c) => ({ ...c, provider: pluginId }));

      for (const camera of result) {
        this.discoveredCamerasCache.set(camera.id, camera);
      }

      return result;
    } catch (error) {
      this.logger.debug(`[Discovery] Plugin ${plugin.pluginName} scan failed:`, error);
      return [];
    }
  }

  private updateSourceCache(sourceId: string, cameras: DiscoveredCameraInternal[], error?: string): void {
    this.sourceCache.set(sourceId, {
      sourceId,
      cameras,
      lastScannedAt: Date.now(),
      scanDurationMs: 0,
      error,
    });

    for (const camera of cameras) {
      this.discoveredCamerasCache.set(camera.id, camera);
    }
  }

  private cleanupOrphanedCameras(activeSources: Set<string>): void {
    for (const sourceId of this.sourceCache.keys()) {
      if (!activeSources.has(sourceId)) {
        const entry = this.sourceCache.get(sourceId);
        if (entry) {
          for (const camera of entry.cameras) {
            this.discoveredCamerasCache.delete(camera.id);
          }
        }
        this.sourceCache.delete(sourceId);
      }
    }
  }

  private mergeResults(): DeviceListItem[] {
    const devices: DeviceListItem[] = [];
    const seenIds = new Set<string>();

    const dbCameras = this.fetchDbCameras();
    for (const camera of dbCameras) {
      if (!seenIds.has(camera.id)) {
        seenIds.add(camera.id);
        devices.push(camera);
      }
    }

    for (const [, entry] of this.sourceCache) {
      for (const camera of entry.cameras) {
        if (!seenIds.has(camera.id)) {
          seenIds.add(camera.id);
          devices.push(this.toDeviceListItem(camera));
        }
      }
    }

    devices.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'camera' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return devices;
  }

  private toDeviceListItem(camera: DiscoveredCameraInternal): DeviceListItem {
    const connectionState = this.connectionStates.get(camera.id);
    let status: DeviceStatus = 'discovered';

    if (connectionState?.status === 'connecting') {
      status = 'adopting';
    } else if (connectionState?.status === 'error') {
      status = 'error';
    }

    const isGo2rtc = camera.provider === 'go2rtc';

    return {
      id: camera.id,
      name: camera.name,
      manufacturer: camera.manufacturer,
      model: camera.model,
      address: camera.address,
      provider: isGo2rtc ? 'camera.ui' : this.formatPluginName(camera.provider),
      status,
      errorMessage: connectionState?.errorMessage,
      type: 'discovered',
      discoveredId: camera.id,
    };
  }

  private findDiscoveredCamera(discoveredId: string): { plugin: Plugin | null; camera: DiscoveredCamera | null } {
    const camera = this.discoveredCamerasCache.get(discoveredId);
    if (camera) {
      const plugin = this.pluginsService.getPluginById(camera.provider);
      return { plugin: plugin ?? null, camera };
    }
    return { plugin: null, camera: null };
  }

  private formatPluginName(pluginId: string): string {
    const plugin = this.pluginsService.getPluginById(pluginId);
    if (plugin) {
      return plugin.pluginName;
    }
    const name = pluginId.replace(/^camera-ui-/, '').replace(/-/g, ' ');
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  private convertGo2rtcSources(sources: DeviceSource[]): DiscoveredCameraInternal[] {
    return sources.map((source) => {
      const { address } = this.parseUrl(source.url);

      // go2rtc ONVIF: name=IP, info="DeviceName Hardware" (may be duplicated like "C210 C210").
      // go2rtc HomeKit: name=actual name, info=model. Prefer info-derived name over IP.
      let displayName = source.name ?? address;
      let model = source.info ?? '';

      if (source.info && source.name && this.looksLikeAddress(source.name)) {
        // Deduplicate repeated words (e.g. "C210 C210" → "C210").
        const words = source.info.trim().split(/\s+/);
        const uniqueWords = [...new Set(words)];
        displayName = uniqueWords.join(' ') || source.name;
        model = uniqueWords.join(' ');
      }

      return {
        id: `go2rtc:${source.type.toLowerCase()}:${source.id ?? address}`,
        name: displayName,
        manufacturer: source.type,
        model,
        address,
        provider: 'go2rtc',
        _internalAddress: address,
        _originalUrl: source.url,
      };
    });
  }

  private looksLikeAddress(value: string): boolean {
    return /^[\d.:[\]]+$/.test(value) || /^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(value);
  }

  private extractAddressFromDbCamera(camera: DeviceListItem): string | undefined {
    const cc = this.api.getCameras().find((c) => c.id === camera.cameraId);
    if (!cc) return undefined;
    return this.extractAddressFromSources(cc.sources);
  }

  private extractAddressFromSources(sources: { urls?: { rtsp?: { base?: string } } }[]): string | undefined {
    if (!sources || sources.length === 0) return undefined;

    for (const source of sources) {
      const rtspUrl = source.urls?.rtsp?.base;
      if (rtspUrl) {
        const { address } = this.parseUrl(rtspUrl);
        if (address && address !== 'localhost' && address !== '127.0.0.1') {
          return address;
        }
      }
    }

    return undefined;
  }

  private parseUrl(url: string): { address: string } {
    try {
      const parsed = new URL(url);
      return { address: parsed.hostname || parsed.pathname };
    } catch {
      const regex = /^(?:\w+:\/\/)?([^:/]+)/;
      const match = regex.exec(url);
      return { address: match?.[1] ?? url };
    }
  }

  private logDiscoverySummary(): void {
    const dbCount = this.fetchDbCameras().length;
    let discoveredCount = 0;

    for (const [sourceId, entry] of this.sourceCache) {
      if (sourceId !== 'database') {
        discoveredCount += entry.cameras.length;
      }
    }

    if (!this.initialScanLogged) {
      this.initialScanLogged = true;
      this.logger.log(`[Discovery] Scan complete: ${dbCount} camera(s), ${discoveredCount} discovered camera(s)`);
    }
  }

  private getGo2rtcCameraSettings(discoveredId: string): JsonSchemaWithoutCallbacks[] {
    const parts = discoveredId.split(':');
    const type = parts[1]?.toLowerCase();
    const schema: JsonSchemaWithoutCallbacks[] = [];

    if (type === 'onvif' || type === 'dvrip') {
      schema.push(
        { key: 'username', type: 'string', title: 'Username', description: 'Camera username', required: true },
        { key: 'password', type: 'string', title: 'Password', description: 'Camera password', format: 'password', required: true },
      );
    } else if (type === 'homekit') {
      schema.push({ key: 'pin', type: 'string', title: 'PIN', description: 'HomeKit pairing PIN (e.g., 123-45-678)', required: true });
    }
    // hass and gopro require no credentials → empty schema.

    return schema;
  }

  private async prepareGo2rtcCamera(discoveredId: string, cameraSettings: Record<string, unknown>): Promise<DBCamera> {
    const parts = discoveredId.split(':');
    const type = parts[1]?.toLowerCase();

    const cached = this.discoveredCamerasCache.get(discoveredId);
    if (!cached?._originalUrl) {
      throw new Error(`Discovered camera "${discoveredId}" not found in cache. Try rescanning.`);
    }

    let cameraName = cached.name;
    let sources: { name: string; role: string; urls: string[]; useForSnapshot?: boolean; hotMode?: boolean; preload?: boolean }[];

    switch (type) {
      case 'onvif': {
        const result = await this.adoptOnvifCamera(cached._originalUrl, cameraSettings);
        cameraName = result.name || cameraName;
        sources = result.sources;
        break;
      }
      case 'homekit': {
        const result = await this.adoptHomeKitCamera(cached._originalUrl, cameraSettings);
        cameraName = result.name || cameraName;
        sources = result.sources;
        break;
      }
      case 'dvrip': {
        const result = await this.adoptDVRipCamera(cached._originalUrl, cameraSettings, cameraName);
        cameraName = result.name;
        sources = result.sources;
        break;
      }
      case 'hass':
      case 'gopro': {
        sources = [
          {
            name: 'Stream 1',
            role: 'high-resolution',
            urls: [cached._originalUrl],
            useForSnapshot: true,
            hotMode: true,
            preload: true,
          },
        ];
        break;
      }
      default:
        throw new Error(`Unsupported go2rtc camera type: ${type}`);
    }

    return createCameraSchema.parse({
      name: cameraName,
      sources,
      info: {
        manufacturer: cached.manufacturer,
        model: cached.model,
      },
    });
  }

  private async adoptOnvifCamera(
    originalUrl: string,
    settings: Record<string, unknown>,
  ): Promise<{
    name: string;
    sources: { name: string; role: string; urls: string[]; useForSnapshot?: boolean; hotMode?: boolean; preload?: boolean }[];
  }> {
    const { username, password } = settings as { username: string; password: string };

    const url = new URL(originalUrl);
    url.username = username;
    url.password = password;
    const authenticatedUrl = url.toString();

    const { sources: profiles } = await this.go2rtcApi.discoverRoute.discoverOnvif({ src: authenticatedUrl });

    if (!profiles.length) {
      throw new Error('No ONVIF streams found. Check credentials.');
    }

    const area = (p: OnvifSource) => (p.width ?? 0) * (p.height ?? 0);
    const isSnapshot = (p: OnvifSource) => p.url.includes('&snapshot');
    const isMjpeg = (p: OnvifSource) => /jpe?g/i.test(p.encoding ?? '');

    const onvifSnapshot = profiles.find(isSnapshot);
    const streams = profiles.filter((p) => !isSnapshot(p));

    // go2rtc encodes profile names as "DeviceName stream1"; strip the suffix.
    // A stripped-to-empty name ('' after trim) must fall back, so || is intended over ??.
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const cameraName = streams[0]?.name?.replace(/\s+stream\d+$/i, '').trim() || 'ONVIF Camera';

    // MJPEG is unfit for continuous decode (motion detection consumes the lowest
    // role): the RTP/JPEG stream drops/corrupts frames and floods the decoder.
    // Keep only H.264/H.265 for the decodable roles, ordered by real resolution.
    const mjpegStreams = streams.filter(isMjpeg).sort((a, b) => area(b) - area(a));
    let videoStreams = streams.filter((p) => !isMjpeg(p)).sort((a, b) => area(b) - area(a));

    const onlyMjpeg = !videoStreams.length;
    if (onlyMjpeg) {
      if (!mjpegStreams.length) {
        throw new Error('No ONVIF video streams found');
      }
      this.logger.warn(`ONVIF camera "${cameraName}" exposes only MJPEG video; motion detection may be unreliable.`);
      videoStreams = mjpegStreams;
    }

    const sources: { name: string; role: string; urls: string[]; useForSnapshot?: boolean; hotMode?: boolean; preload?: boolean }[] = [];

    // Role mapping: 1 stream → high; 2 streams → high+low; 3+ streams → high+mid+low (max 3).
    videoStreams.slice(0, 3).forEach((profile, index) => {
      let role: string;

      if (index === 0) {
        role = 'high-resolution';
      } else if (videoStreams.length === 2) {
        role = 'low-resolution';
      } else if (index === 1) {
        role = 'mid-resolution';
      } else {
        role = 'low-resolution';
      }

      const eagerSafe = this.onvifEagerConnectSafe(profile.url);
      sources.push({
        // Use simple names; go2rtc profile.name usually duplicates the camera name in the path.
        name: `Stream ${index + 1}`,
        role,
        urls: [profile.url],
        hotMode: eagerSafe,
        preload: eagerSafe,
      });
    });

    // Snapshot priority: dedicated ONVIF snapshot > MJPEG profile (frames are
    // already JPEG → no transcode) > high-res video via go2rtc frame.jpeg.
    if (onvifSnapshot) {
      sources.push({
        name: 'Snapshot',
        role: 'snapshot',
        urls: [onvifSnapshot.url],
        hotMode: false,
        preload: false,
      });
    } else if (mjpegStreams.length && !onlyMjpeg) {
      sources.push({
        name: 'Snapshot',
        role: 'snapshot',
        urls: [mjpegStreams[0].url],
        hotMode: false,
        preload: false,
      });
    } else if (sources.length) {
      sources[0].useForSnapshot = true;
    }

    return { name: cameraName, sources };
  }

  private async adoptHomeKitCamera(
    originalUrl: string,
    settings: Record<string, unknown>,
  ): Promise<{ name: string; sources: { name: string; role: string; urls: string[]; useForSnapshot?: boolean; hotMode?: boolean; preload?: boolean }[] }> {
    const { pin } = settings as { pin: string };

    const url = new URL(originalUrl);
    const deviceId = url.searchParams.get('device_id') ?? 'homekit';

    const pairResult = await this.go2rtcApi.streamsRoute.pairHomekit({
      id: deviceId.replace(/:/g, ''),
      url: originalUrl,
      pin,
    });

    const sources = [
      {
        name: 'Stream 1',
        role: 'high-resolution',
        urls: [pairResult.source.url],
        useForSnapshot: true,
        hotMode: true,
        preload: true,
      },
    ];

    return {
      name: pairResult.source.name || 'HomeKit Camera',
      sources,
    };
  }

  private async adoptDVRipCamera(
    originalUrl: string,
    settings: Record<string, unknown>,
    cameraName: string,
  ): Promise<{ name: string; sources: { name: string; role: string; urls: string[]; useForSnapshot?: boolean; hotMode?: boolean; preload?: boolean }[] }> {
    const { username, password } = settings as { username: string; password: string };

    // Format: dvrip://username:password@host?channel=0&subtype=0
    const url = new URL(originalUrl);
    url.username = username;
    url.password = password;

    if (!url.searchParams.has('channel')) {
      url.searchParams.set('channel', '0');
    }
    if (!url.searchParams.has('subtype')) {
      url.searchParams.set('subtype', '0');
    }

    const authenticatedUrl = url.toString();

    const sources = [
      {
        name: 'Stream 1',
        role: 'high-resolution',
        urls: [authenticatedUrl],
        useForSnapshot: true,
        hotMode: true,
        preload: true,
      },
    ];

    return { name: cameraName, sources };
  }

  private async preparePluginCamera(discoveredId: string, cameraSettings: Record<string, unknown>): Promise<DBCamera> {
    const { plugin, camera } = this.findDiscoveredCamera(discoveredId);

    if (!plugin || !camera) {
      throw new Error(`Camera "${discoveredId}" not found`);
    }

    if (!plugin.worker?.isRunning()) {
      throw new Error(`Plugin "${plugin.pluginName}" is not running`);
    }

    const cameraConfig = await plugin.worker.pluginProxy.onAdoptCamera?.(camera, cameraSettings);
    if (!cameraConfig) {
      throw new Error(`Plugin "${plugin.pluginName}" does not support camera adoption`);
    }

    if (!cameraConfig.sources.length) {
      throw new Error(`Camera "${cameraConfig.name}" must have at least one source`);
    }

    cameraConfig.sources = cameraConfig.sources.map((source) => {
      if (!source.urls?.length) {
        source.urls = ['cui://127.0.0.1'];
      }
      return source;
    });

    const validatedData = createCameraSchema.parse({
      ...cameraConfig,
      pluginInfo: {
        id: plugin.id,
        name: plugin.pluginName,
      },
    });

    validatedData.sources = validatedData.sources.map((source) => {
      if (source.urls.length === 1 && source.urls[0].startsWith('cui://')) {
        source.urls = [`cui://127.0.0.1:${this.configService.config.port}/api/cameras/streams/${validatedData._id}/${source.name}`];
      }
      return source;
    });

    return validatedData;
  }

  private setConnectionState(discoveredId: string, status: ConnectionState['status'], errorMessage?: string): void {
    this.connectionStates.set(discoveredId, { status, errorMessage });
  }

  private removeFromDiscoveredCache(discoveredId: string): void {
    this.discoveredCamerasCache.delete(discoveredId);

    for (const [sourceId, entry] of this.sourceCache) {
      const index = entry.cameras.findIndex((c) => c.id === discoveredId);
      if (index !== -1) {
        entry.cameras.splice(index, 1);
        this.sourceCache.set(sourceId, entry);
        break;
      }
    }

    this.connectionStates.delete(discoveredId);
  }

  private broadcastDiscovered(devices: DeviceListItem[], source: string): void {
    this.publishDiscoveryEvent('cameras:discovered', { devices, source });
  }

  private broadcastScanningStatus(isScanning: boolean): void {
    this.publishDiscoveryEvent('cameras:scanning', { isScanning });
  }

  private broadcastConnectionStatus(discoveredId: string): void {
    const state = this.connectionStates.get(discoveredId) ?? { status: 'idle' };
    this.publishDiscoveryEvent('cameras:connection-status', {
      discoveredId,
      status: state.status,
      errorMessage: state.errorMessage,
    });
  }

  private onvifEagerConnectSafe(streamUrl: string): boolean {
    try {
      const token = new URL(streamUrl).searchParams.get('subtype');
      return !!token && /\D/.test(token);
    } catch {
      return false;
    }
  }
}
