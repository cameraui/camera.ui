import { RPCMethod } from '@camera.ui/rpc';

import { FloorPlanService } from '../api/services/floorplan.service.js';
import { PluginsService } from '../api/services/plugins.service.js';
import { RemoteService } from '../api/services/remote.service.js';
import { RoomsService } from '../api/services/rooms.service.js';
import { ServerService } from '../api/services/server.service.js';
import { WorkersService } from '../api/services/workers.service.js';
import { inject } from '../container.js';
import { instanceLanguage } from '../i18n/index.js';
import { NamespaceManager } from '../rpc/namespaces.js';

import type { AssistantAccess, AssistantAskResult, PluginInterface } from '@camera.ui/sdk';
import type { AssistantAskRequest, AssistantPost } from '../assistant/types.js';
import type { ProxyServer } from '../rpc/index.js';
import type {
  CoreManagerInterface,
  CoreManagerProxyEvents,
  CoreManagerProxyGenericEvent,
  FloorPlan,
  HostPluginInfo,
  TrainingCandidateIngest,
  TrainingIngestResult,
} from '../rpc/interfaces/core.js';
import type { ConfigService } from '../services/config/index.js';

export class CoreManager implements CoreManagerInterface {
  private proxyServer: ProxyServer;
  private configService: ConfigService;
  private serverService: ServerService;
  private pluginService: PluginsService;
  private remoteService: RemoteService;
  private roomsService: RoomsService;
  private floorPlanService: FloorPlanService;
  private workersService: WorkersService;

  private namespaces = NamespaceManager.coreManagerNamespaces();
  private closeProxy?: () => Promise<void>;

  constructor() {
    this.serverService = new ServerService();
    this.pluginService = new PluginsService();
    this.remoteService = new RemoteService();
    this.roomsService = new RoomsService();
    this.floorPlanService = new FloorPlanService();
    this.workersService = new WorkersService();
    this.configService = inject('configService');
    this.proxyServer = inject('proxy');
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
  public async ingestTrainingCandidate(payload: TrainingCandidateIngest): Promise<TrainingIngestResult> {
    return inject('trainingCandidateManager').ingest(payload);
  }

  @RPCMethod
  public async getTrainingCollectionEnabled(): Promise<boolean> {
    return inject('trainingCandidateManager').getSettings().enabled;
  }

  @RPCMethod
  public async assistantAsk(request: AssistantAskRequest): Promise<AssistantAskResult> {
    return inject('assistantManager').ask(request);
  }

  @RPCMethod
  public async assistantAccess(pluginId: string): Promise<AssistantAccess> {
    return inject('assistantManager').access(pluginId);
  }

  @RPCMethod
  public async assistantPost(post: AssistantPost): Promise<boolean> {
    if (!post || typeof post.userId !== 'string' || typeof post.threadId !== 'string' || typeof post.text !== 'string') return false;
    await inject('assistantManager').post(post);
    return true;
  }

  @RPCMethod
  public async getFFmpegPath(): Promise<string> {
    return this.configService.go2rtcConfig.ffmpeg.bin;
  }

  @RPCMethod
  public async getServerAddresses(pluginId?: string): Promise<string[]> {
    if (pluginId && this.pluginService.getPluginProcessById(pluginId)?.isRemoteWorker) {
      const agentId = this.pluginService.getPluginDbById(pluginId)?.workerAgentId;
      return agentId ? this.workersService.getWorkerServerAddresses(agentId) : [];
    }
    return this.serverService.info().serverAddresses ?? [];
  }

  @RPCMethod
  public async getCloudServerId(): Promise<string> {
    return this.remoteService.getCloud().oauth?.server_id ?? '';
  }

  @RPCMethod
  public async getRestoreGeneration(): Promise<string> {
    return inject('dbs').settingsDB.get('settings')?.restoreGeneration ?? '';
  }

  @RPCMethod
  public async getInstanceId(): Promise<string> {
    return inject('dbs').settingsDB.get('settings')?.instanceId ?? '';
  }

  @RPCMethod
  public async getLanguage(): Promise<string> {
    return instanceLanguage();
  }

  @RPCMethod
  public async getFloorPlan(): Promise<FloorPlan> {
    return { rooms: this.roomsService.get(), plan: this.floorPlanService.get() };
  }
}
