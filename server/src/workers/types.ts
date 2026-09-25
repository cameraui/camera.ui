import type { UsableNetworkAddress } from '@camera.ui/common/network';
import type { SystemInfo } from '../utils/system-info.js';

export enum WorkerCapability {
  FrameDecoding = 'frameDecoding',
  PluginHost = 'pluginHost',
}

export interface RemoteCameraConfig {
  cameraId: string;
  cameraName: string;
  loggerLevel: string;
}

export interface RemotePluginConfig {
  pluginId: string;
  pluginName: string;
  version: string;
  displayName: string;
  loggerLevel: string;
  rtspUsername?: string;
  rtspPassword?: string;
}

export interface CapabilitySpec {
  [WorkerCapability.FrameDecoding]: RemoteCameraConfig;
  [WorkerCapability.PluginHost]: RemotePluginConfig;
}

export interface WorkloadSpec<C extends WorkerCapability = WorkerCapability> {
  id: string;
  capability: C;
  spec: CapabilitySpec[C];
  revision: number;
}

export function workloadKey(capability: WorkerCapability, id: string): string {
  return `${capability}:${id}`;
}

export interface WorkerProcessRef {
  capability: WorkerCapability;
  id: string;
  pid: number;
}

export interface WorkerProcessSample extends WorkerProcessRef {
  cpuLoad: string;
  memLoad: string;
}

export type RemotePluginState = 'installing' | 'retrying' | 'running';

export interface RemotePluginStatus {
  id: string;
  state: RemotePluginState;
}

export interface WorkerHealthInfo {
  agentId: string;
  name: string;
  uptime: number;
  cameras: string[];
  capabilities: WorkerCapability[];
  cpuUsage?: number;
  memoryUsage?: number;
}

export interface WorkerPlatform {
  os: string;
  arch: string;
}

export interface WorkerUpdateState {
  updatable: boolean;
  updating: boolean;
  error?: string;
}

export interface WorkerInfo {
  agentId: string;
  name: string;
  online: boolean;
  lastHeartbeat: number;
  cameras: string[];
  capabilities: WorkerCapability[];
  version?: string;
  versionMismatch?: boolean;
  update?: WorkerUpdateState;
  platform?: WorkerPlatform;
  addresses?: UsableNetworkAddress[];
  serverAddresses?: string[];
  system?: SystemInfo;
  pid?: number;
  cpuLoad?: string;
  memLoad?: string;
  plugins?: RemotePluginStatus[];
  processes?: WorkerProcessSample[];
  health?: WorkerHealthInfo;
}

export interface WorkerHeartbeat {
  agentId: string;
  name: string;
  cameras: string[];
  uptime: number;
  capabilities: WorkerCapability[];
  version: string;
  platform: WorkerPlatform;
  addresses?: UsableNetworkAddress[];
  system?: SystemInfo;
  pid: number;
  cpuLoad: string;
  memLoad: string;
  plugins?: RemotePluginStatus[];
  processes?: WorkerProcessSample[];
  update: WorkerUpdateState;
}

export interface WorkerSyncResponse {
  workloads: WorkloadSpec[];
  updateChannel?: 'latest' | 'beta';
}

export interface WorkerManagerRPC {
  heartbeat(heartbeat: WorkerHeartbeat): Promise<WorkerSyncResponse>;
}

export interface WorkerAgentRPC {
  ping(): Promise<WorkerHealthInfo>;
  restart(): Promise<void>;
  update(version?: string): Promise<void>;
}

export interface KnownWorker {
  agentId: string;
  name: string;
  displayName?: string;
  serverAddresses?: string[];
  lastSeen: number;
}
