import { RPCMethod } from '@camera.ui/rpc';

import { CamerasService } from '../api/services/cameras.service.js';
import { inject } from '../container.js';
import { ProxyServer } from '../rpc/index.js';
import { NamespaceManager } from '../rpc/namespaces.js';
import { addCameraSource, removeCameraSource } from './camera-sources.js';

import type { Camera, CameraConfigInputSettings } from '@camera.ui/sdk';
import type { CameraSourceChange, DeviceManagerInterface, DeviceManagerProxyEvents, DeviceManagerProxyGenericEvent } from '../rpc/interfaces/device.js';

const DEVICE_LIFECYCLE_TIMEOUT_MS = 30_000;

export class DeviceManager implements DeviceManagerInterface {
  private proxyServer: ProxyServer;
  private camerasService: CamerasService;

  private namespaces = NamespaceManager.deviceManagerNamespaces();
  private closeProxy?: () => Promise<void>;

  constructor() {
    this.camerasService = new CamerasService();
    this.proxyServer = inject('proxy');
  }

  public async register(): Promise<void> {
    this.closeProxy = await this.proxyServer.proxy.registerHandler(this.namespaces.deviceManagerRpc, this);
  }

  public async destroy(): Promise<void> {
    await this.closeProxy?.();
  }

  public publishDeviceManagerEvent<K extends keyof DeviceManagerProxyEvents>(pluginId: string, type: K, data: DeviceManagerProxyEvents[K]): void {
    const namespaces = NamespaceManager.pluginNamespaces(pluginId);
    const event: DeviceManagerProxyGenericEvent<K> = { type, data };
    this.proxyServer.proxy.publish(namespaces.pluginDeviceManagerSubject, event);
  }

  public async requestDeviceManagerEvent<K extends keyof DeviceManagerProxyEvents, R = any>(pluginId: string, type: K, data: DeviceManagerProxyEvents[K]): Promise<R> {
    const namespaces = NamespaceManager.pluginNamespaces(pluginId);
    const event: DeviceManagerProxyGenericEvent<K> = { type, data };
    return this.proxyServer.proxy.request<DeviceManagerProxyGenericEvent<K>, R>(namespaces.pluginDeviceManagerSubject, event, {
      timeout: DEVICE_LIFECYCLE_TIMEOUT_MS,
    });
  }

  @RPCMethod
  public async getCamera(cameraIdOrName: string): Promise<Camera | undefined> {
    return this.camerasService.findTransformedByName(cameraIdOrName) ?? this.camerasService.findTransformedById(cameraIdOrName);
  }

  @RPCMethod
  public async addCameraSource(pluginId: string, cameraId: string, source: CameraConfigInputSettings): Promise<CameraSourceChange> {
    return addCameraSource(this.camerasService, pluginId, cameraId, source);
  }

  @RPCMethod
  public async removeCameraSource(pluginId: string, cameraId: string, sourceId: string): Promise<CameraSourceChange> {
    return removeCameraSource(this.camerasService, pluginId, cameraId, sourceId);
  }
}
