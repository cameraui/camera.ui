import type { LoadedModel } from '@camera.ui/sdk';
import type { Namespace } from 'socket.io';
import type { PLUGIN_STATUS } from '../../plugins/types.js';
import type { RuntimeInfo } from '../../services/config/types.js';

export type SocketNsp =
  '/camera.ui' | '/events' | '/metrics' | '/logs' | '/status' | '/notifications' | '/plugins' | '/server' | '/cameras' | '/sensors' | '/workers' | '/training';

export interface SocketNspMap {
  nsp: Namespace;
  [key: string]: any;
}

export type ProcessType = 'system' | 'core' | 'frameworker' | 'plugin';

export interface WorkerDetectorStats {
  plugin: string;
  input?: string;
  runtime?: string;
  models?: LoadedModel[];
  inferenceMs: number;
  transportMs: number;
  stamped: boolean;
}

export interface WorkerPerfStats {
  detectors: Record<string, WorkerDetectorStats>;
  processingMs: number;
  decodeMs: number;
  mainDecodeMs: number;
  scaleMs: number;
  postMs: number;
  transportMs: number;
  analysedFps: number;
  mainFps: number;
  mainStreamEnabled: boolean;
  frameAnalysis: boolean;
  activePercent: number;
  zoomPercent: number;
  zoomWindows: number;
  objectsPerFrame: number;
  hitPercent: number;
  switches: number;
  minutes: number;
}

export interface ProcessInfo {
  name: string;
  worker?: string;
  pid?: number;
  cpuLoad: string;
  memLoad: string;
  type: ProcessType;
  timestamp: number;
  perf?: WorkerPerfStats;
}

export interface ServerProcessInfo {
  'camera.ui': ProcessInfo;
  go2rtc: ProcessInfo;
  nats: ProcessInfo;
}

export interface ServerProcesses {
  'camera.ui': ProcessInfo[];
  go2rtc: ProcessInfo[];
  nats: ProcessInfo[];
}

export type WorkerProcessInfo = Record<string, ProcessInfo>;

export type WorkerProcesses = Record<string, ProcessInfo[]>;

export interface AllProcesses extends ServerProcessInfo {
  plugins: WorkerProcessInfo;
  workers: WorkerProcessInfo;
}

export interface PluginRuntimeInfo {
  name: string;
  status: PLUGIN_STATUS;
}

export interface ServerRuntime {
  'camera.ui'?: RuntimeInfo;
  go2rtc?: RuntimeInfo;
  tunnelClient?: RuntimeInfo;
  nats?: RuntimeInfo;
}

export type WorkerRuntime = Record<string, PluginRuntimeInfo>;
