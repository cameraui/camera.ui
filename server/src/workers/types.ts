import type { UsableNetworkAddress } from '@camera.ui/common/network';
import type { SystemInfo } from '../utils/system-info.js';

export const WORKER_PROTOCOL = 2;
export const MIN_WORKER_PROTOCOL = 2;

export enum WorkerCapability {
  FrameDecoding = 'frameDecoding',
  PluginHost = 'pluginHost',
}

export interface RemoteCameraConfig {
  cameraId: string;
  cameraName?: string;
  loggerLevel?: string;
}

export interface RemotePluginConfig {
  pluginId: string;
  pluginName: string;
  version: string;
  integrity?: string;
  tarball?: string;
  rtspUsername?: string;
  rtspPassword?: string;
  displayName?: string;
  loggerLevel?: string;
}

export interface CapabilitySpec {
  [WorkerCapability.FrameDecoding]: RemoteCameraConfig;
  [WorkerCapability.PluginHost]: RemotePluginConfig;
}

export interface WorkloadLive {
  loggerLevel?: string;
  displayName?: string;
  cameraName?: string;
  prepare?: PluginBuild;
}

export type PluginBuild = Pick<RemotePluginConfig, 'version' | 'integrity' | 'tarball'>;

export interface PluginInstallReport {
  version: string;
  step: 'download' | 'dependencies' | 'staged' | 'failed';
  error?: string;
}

export interface WorkloadBinding {
  instanceId: string;
  handshake: 1 | 2;
}

export interface WorkloadSpec<C extends WorkerCapability = WorkerCapability> {
  id: string;
  capability: C;
  spec: CapabilitySpec[C];
  revision: number;
  gen?: string;
  adopt?: boolean;
  bound?: WorkloadBinding;
  live?: WorkloadLive;
}

export type ReleaseReason = 'removed' | 'disabled' | 'incompatible' | 'conflict';

export interface MasterSyncInfo {
  runId: string;
  level: number;
  seq: number;
  leaseMs: number;
  holds?: string[];
  stopping?: { untilMs: number };
  release?: { reason: ReleaseReason };
}

export type WorkloadPhase = 'provisioning' | 'spawning' | 'running' | 'stopping' | 'backoff' | 'stopped' | 'failed';
export type ExitReason = 'requested' | 'clean' | 'crashed' | 'lease' | 'parent' | 'master-stop';
export type FailureKind = 'platform' | 'gated' | 'install' | 'binary-missing' | 'crash-loop' | 'capability' | 'initialize' | 'handshake';

export interface WorkloadExit {
  instanceId: string;
  code: number | null;
  signal: string | null;
  at: number;
  uptimeMs: number;
  reason: ExitReason;
}

export interface WorkloadReport {
  key: string;
  gen?: string;
  revision: number;
  phase: WorkloadPhase;
  since: number;
  instanceId?: string;
  pid?: number;
  handshake?: 1 | 2;
  restarts: number;
  nextRestartAt?: number;
  version?: string;
  linked?: boolean;
  install?: PluginInstallReport;
  lastExit?: WorkloadExit;
  failure?: { kind: FailureKind; message: string; terminal: boolean };
}

export type LeaseState = 'held' | 'silent' | 'fenced' | 'released' | 'rejected' | 'conflict' | 'suspended';

export interface WorkerLease {
  state: LeaseState;
  expiresInMs?: number;
}

export type DisconnectReason = 'stop' | 'restart' | 'update' | 'suspend' | 'lease' | 'released' | 'rejected';

export interface WorkerDisconnect {
  agentId: string;
  bootId?: string;
  reason?: DisconnectReason;
  phase?: 'stopping' | 'stopped';
  expectBackMs?: number;
}

export interface WorkerNudge {
  runId?: string;
  seq?: number;
  notice?: 'shutdown';
}

export function workloadKey(capability: WorkerCapability, id: string): string {
  return `${capability}:${id}`;
}

export function parseWorkloadKey(key: string): { capability: WorkerCapability; id: string } | undefined {
  const at = key.indexOf(':');
  const capability = key.slice(0, at) as WorkerCapability;
  if (at < 0 || !Object.values(WorkerCapability).includes(capability)) {
    return undefined;
  }
  return { capability, id: key.slice(at + 1) };
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
  version?: string;
  cpuUsage?: number;
  memoryUsage?: number;
  protocol?: number;
  bootId?: string;
  runId?: string;
}

export interface WorkerPlatform {
  os: string;
  arch: string;
  libc?: string;
}

export interface WorkerUpdateState {
  updatable: boolean;
  updating: boolean;
  error?: string;
  phase?: 'installing' | 'staged' | 'restarting' | 'failed';
  target?: string;
  desktop?: boolean;
  lastResult?: { target: string; result: 'applied' | 'swap-failed' | 'rolled-back'; reason?: string };
}

export type VersionStanding = 'behind' | 'same' | 'ahead' | 'unknown';

export type WorkerState = 'expected' | 'online' | 'unreachable' | 'restarting' | 'offline' | 'outdated' | 'releasing' | 'released' | 'conflict';

export interface WorkerInfo {
  agentId: string;
  name: string;
  online: boolean;
  state?: WorkerState;
  stateSince?: number;
  stateUntil?: number;
  stateReason?: string;
  bootId?: string;
  protocol?: number;
  workloads?: WorkloadReport[];
  lease?: WorkerLease;
  lastHeartbeat: number;
  cameras: string[];
  capabilities: WorkerCapability[];
  version?: string;
  versionMismatch?: boolean;
  versionStanding?: VersionStanding;
  appVersion?: string;
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
  bootId?: string;
  prevBootIds?: string[];
  protocol?: number;
  runId?: string;
  appliedSeq?: number;
  reportSeq?: number;
  workloads?: WorkloadReport[];
  lease?: WorkerLease;
  pluginProtocol?: { level: number; min: number };
  appVersion?: string;
}

export interface PluginPurge {
  pluginName: string;
  storage: boolean;
}

export interface WorkerSyncResponse {
  workloads: WorkloadSpec[];
  purge?: PluginPurge[];
  updateChannel?: 'latest' | 'beta';
  updateTarget?: string;
  master?: MasterSyncInfo;
}

export interface WorkerManagerRPC {
  heartbeat(heartbeat: WorkerHeartbeat): Promise<WorkerSyncResponse>;
}

export interface HostPort {
  host: string;
  port: number;
}

export interface WorkerAgentRPC {
  ping(): Promise<WorkerHealthInfo>;
  restart(): Promise<void>;
  update(version?: string): Promise<void>;
  openTunnel(target: HostPort, token: string): Promise<void>;
}

export interface CrossHostFrameLink {
  cameraId: string;
  cameraName: string;
  cameraWorker?: string;
  pluginName: string;
  pluginWorker?: string;
  sensorTypes: string[];
}

export interface KnownWorker {
  agentId: string;
  name: string;
  displayName?: string;
  serverAddresses?: string[];
  lastSeen: number;
  version?: string;
  protocol?: number;
}
