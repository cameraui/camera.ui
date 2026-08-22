import { RPCClass, RPCMethod } from '@camera.ui/rpc';
import { container } from 'tsyringe';

import { FloorPlanService } from '../api/services/floorplan.service.js';
import { PluginsService } from '../api/services/plugins.service.js';
import { RemoteService } from '../api/services/remote.service.js';
import { RoomsService } from '../api/services/rooms.service.js';
import { ServerService } from '../api/services/server.service.js';
import { NamespaceManager } from '../rpc/namespaces.js';

import type { PluginInterface } from '@camera.ui/sdk';
import type { ProxyServer } from '../rpc/index.js';
import type { CoreManagerInterface, CoreManagerProxyEvents, CoreManagerProxyGenericEvent, FloorPlan, HostPluginInfo } from '../rpc/interfaces/core.js';
import type { ConfigService } from '../services/config/index.js';

@RPCClass
export class CoreManager implements CoreManagerInterface {
  private proxyServer: ProxyServer;
  private configService: ConfigService;
  private serverService: ServerService;
  private pluginService: PluginsService;
  private remoteService: RemoteService;
  private roomsService: RoomsService;
  private floorPlanService: FloorPlanService;

  private namespaces = NamespaceManager.coreManagerNamespaces();
  private closeProxy?: () => Promise<void>;

  constructor() {
    this.serverService = new ServerService();
    this.pluginService = new PluginsService();
    this.remoteService = new RemoteService();
    this.roomsService = new RoomsService();
    this.floorPlanService = new FloorPlanService();
    this.configService = container.resolve<ConfigService>('configService');
    this.proxyServer = container.resolve<ProxyServer>('proxy');
  }

  public async register(): Promise<void> {
    this.closeProxy = await this.proxyServer.proxy.registerHandler(this.namespaces.coreManagerRpc, this);
  }

  public async destroy(): Promise<void> {
    await this.closeProxy?.();
  }

  public publishCoreManagerEvent<K extends keyof CoreManagerProxyEvents>(type: K, data: CoreManagerProxyEvents[K]): void {
    const event: CoreManagerProxyGenericEvent<K> = { type, data };
    this.proxyServer.proxy.publish(this.namespaces.coreManagerSubject, event);
  }

  public async requestCoreManagerEvent<K extends keyof CoreManagerProxyEvents, R = any>(type: K, data: CoreManagerProxyEvents[K]): Promise<R> {
    const event: CoreManagerProxyGenericEvent<K> = { type, data };
    return this.proxyServer.proxy.request<CoreManagerProxyGenericEvent<K>, R>(this.namespaces.coreManagerSubject, event);
  }

  @RPCMethod
  public async getPlugin(pluginName: string): Promise<HostPluginInfo | undefined> {
    const plugin = this.pluginService.getPluginByName(pluginName);
    if (plugin) {
      return {
        id: plugin.id,
        name: plugin.pluginName,
        contract: plugin.contract,
        running: plugin.worker?.isRunning() === true,
      };
    }
  }

  @RPCMethod
  public async getPluginsByInterface(interfaceName: PluginInterface): Promise<HostPluginInfo[]> {
    const allPlugins = this.pluginService.listPlugins();
    return allPlugins
      .filter((p) => p.contract.interfaces?.includes(interfaceName) && !p.disabled)
      .map((p) => ({ id: p.id, name: p.pluginName, contract: p.contract, running: p.worker?.isRunning() === true }));
  }

  @RPCMethod
  public async getFFmpegPath(): Promise<string> {
    return this.configService.go2rtcConfig.ffmpeg.bin;
  }

  @RPCMethod
  public async getServerAddresses(): Promise<string[]> {
    return this.serverService.info().serverAddresses ?? [];
  }

  @RPCMethod
  public async getCloudServerId(): Promise<string> {
    return this.remoteService.getCloud().oauth?.server_id ?? '';
  }

  @RPCMethod
  public async getFloorPlan(): Promise<FloorPlan> {
    return { rooms: this.roomsService.get(), plan: this.floorPlanService.get() };
  }
}
