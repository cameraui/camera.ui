import type { Namespace } from 'socket.io';
import type { PLUGIN_STATUS } from '../../plugins/types.js';
import type { RuntimeInfo } from '../../services/config/types.js';

export type SocketNsp = '/camera.ui' | '/metrics' | '/logs' | '/status' | '/notifications' | '/plugins' | '/server' | '/cameras' | '/workers';

export interface SocketNspMap {
  nsp: Namespace;
  [key: string]: any;
}

export type ProcessType = 'system' | 'core' | 'frameworker' | 'plugin';

export interface ProcessInfo {
  name: string;
  pid?: number;
  cpuLoad: string;
  memLoad: string;
  type: ProcessType;
  timestamp: number;
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
