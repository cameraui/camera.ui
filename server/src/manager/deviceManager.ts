import { RPCClass, RPCMethod } from '@camera.ui/rpc';
import { container } from 'tsyringe';

import { CamerasService } from '../api/services/cameras.service.js';
import { ProxyServer } from '../rpc/index.js';
import { NamespaceManager } from '../rpc/namespaces.js';

import type { Camera } from '@camera.ui/sdk';
import type { DeviceManagerInterface, DeviceManagerProxyEvents, DeviceManagerProxyGenericEvent } from '../rpc/interfaces/device.js';

@RPCClass
export class DeviceManager implements DeviceManagerInterface {
  private proxyServer: ProxyServer;
  private camerasService: CamerasService;

  private namespaces = NamespaceManager.deviceManagerNamespaces();
  private closeProxy?: () => Promise<void>;

  constructor() {
    this.camerasService = new CamerasService();
    this.proxyServer = container.resolve<ProxyServer>('proxy');
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
    return this.proxyServer.proxy.request<DeviceManagerProxyGenericEvent<K>, R>(namespaces.pluginDeviceManagerSubject, event);
  }

  @RPCMethod
  public async getCamera(cameraIdOrName: string): Promise<Camera | undefined> {
    return this.camerasService.findTransformedByName(cameraIdOrName) ?? this.camerasService.findTransformedById(cameraIdOrName);
  }
}
