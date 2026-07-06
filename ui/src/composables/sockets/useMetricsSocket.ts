import { RUNTIME_STATUS } from '@shared/types';

import type { SocketChannel } from '@/connection/index.js';
import type { AllProcesses, PluginRuntimeInfo, ProcessInfo, ServerProcesses, ServerProcessInfo, ServerRuntime, WorkerProcesses, WorkerProcessInfo } from '@shared/types';

export const MAX_METRICS_DATA_POINTS = 30;

export const DEFAULT_PROCESS_LOAD: Omit<ProcessInfo, 'name' | 'type'> = {
  pid: -1,
  cpuLoad: '0.00',
  memLoad: '0.00',
  timestamp: 0,
};

export interface MetricsSocketState {
  systemProcess: ProcessInfo[];
  systemProcessInfo: ProcessInfo[];

  serverStatus: RUNTIME_STATUS;
  go2rtcStatus: RUNTIME_STATUS;
  natsStatus: RUNTIME_STATUS;
  coreProcesses: ServerProcessInfo;
  coreProcessInfos: ServerProcesses;

  frameWorkerStatus: Record<string, PluginRuntimeInfo>;
  frameWorkersProcess: WorkerProcessInfo;
  frameWorkersProcessInfos: WorkerProcesses;

  pluginsStatus: Record<string, PluginRuntimeInfo>;
  pluginsProcesses: WorkerProcessInfo;
  pluginsProcessInfos: WorkerProcesses;
}

function makeInitialState(): MetricsSocketState {
  return {
    systemProcess: [{ name: 'system', type: 'system', ...DEFAULT_PROCESS_LOAD }],
    systemProcessInfo: [],
    serverStatus: RUNTIME_STATUS.UNKNOWN,
    go2rtcStatus: RUNTIME_STATUS.UNKNOWN,
    natsStatus: RUNTIME_STATUS.UNKNOWN,
    coreProcesses: {
      'camera.ui': { name: 'camera.ui', type: 'core', ...DEFAULT_PROCESS_LOAD },
      go2rtc: { name: 'go2rtc', type: 'core', ...DEFAULT_PROCESS_LOAD },
      nats: { name: 'nats', type: 'core', ...DEFAULT_PROCESS_LOAD },
    },
    coreProcessInfos: {
      'camera.ui': [],
      go2rtc: [],
      nats: [],
    },
    frameWorkerStatus: {},
    frameWorkersProcess: {},
    frameWorkersProcessInfos: {},
    pluginsStatus: {},
    pluginsProcesses: {},
    pluginsProcessInfos: {},
  };
}

const state = reactive<MetricsSocketState>(makeInitialState());

let scope: ReturnType<typeof effectScope> | null = null;
let metricsChannel: SocketChannel | null = null;
let statusChannel: SocketChannel | null = null;

function isBothConnected(): boolean {
  return Boolean(metricsChannel?.connected.value && statusChannel?.connected.value);
}

function applyRealtimeProcessInfos(data: AllProcesses): void {
  if (data['camera.ui']) state.coreProcesses['camera.ui'] = data['camera.ui'];
  if (data.go2rtc) state.coreProcesses.go2rtc = data.go2rtc;
  if (data.nats) state.coreProcesses.nats = data.nats;
  for (const [name, processInfo] of Object.entries(data.workers ?? {})) {
    state.frameWorkersProcess[name] = processInfo;
  }
  for (const [name, processInfo] of Object.entries(data.plugins ?? {})) {
    state.pluginsProcesses[name] = processInfo;
  }
}

function applyProcessInfos(data: AllProcesses): void {
  if (data['camera.ui']) {
    state.coreProcessInfos['camera.ui'].push(data['camera.ui']);
    state.coreProcessInfos['camera.ui'] = state.coreProcessInfos['camera.ui'].slice(-MAX_METRICS_DATA_POINTS);
  }
  if (data.go2rtc) {
    state.coreProcessInfos.go2rtc.push(data.go2rtc);
    state.coreProcessInfos.go2rtc = state.coreProcessInfos.go2rtc.slice(-MAX_METRICS_DATA_POINTS);
  }
  if (data.nats) {
    state.coreProcessInfos.nats.push(data.nats);
    state.coreProcessInfos.nats = state.coreProcessInfos.nats.slice(-MAX_METRICS_DATA_POINTS);
  }
  for (const [name, processInfo] of Object.entries(data.workers ?? {})) {
    if (!state.frameWorkersProcessInfos[name]) state.frameWorkersProcessInfos[name] = [];
    state.frameWorkersProcessInfos[name].push(processInfo);
    state.frameWorkersProcessInfos[name] = state.frameWorkersProcessInfos[name].slice(-MAX_METRICS_DATA_POINTS);
  }
  for (const [name, processInfo] of Object.entries(data.plugins ?? {})) {
    if (!state.pluginsProcessInfos[name]) state.pluginsProcessInfos[name] = [];
    state.pluginsProcessInfos[name].push(processInfo);
    state.pluginsProcessInfos[name] = state.pluginsProcessInfos[name].slice(-MAX_METRICS_DATA_POINTS);
  }
}

async function loadSystemProcessInfos(): Promise<void> {
  if (!metricsChannel?.ready.value) return;
  try {
    state.systemProcessInfo = await metricsChannel.request<ProcessInfo[]>('get-system-info');
  } catch {
    /* silent */
  }
}

async function loadCoreProcessInfos(): Promise<void> {
  if (!metricsChannel?.ready.value || !statusChannel?.ready.value) return;
  statusChannel.emit('get-process-status');
  try {
    state.coreProcessInfos = await metricsChannel.request<ServerProcesses>('get-server-process-info');
  } catch {
    /* silent */
  }
}

async function loadFrameWorkerProcessInfos(): Promise<void> {
  if (!metricsChannel?.ready.value || !statusChannel?.ready.value) return;
  statusChannel.emit('get-frameworker-process-status');
  try {
    state.frameWorkersProcessInfos = await metricsChannel.request<WorkerProcesses>('get-frameworker-process-info');
  } catch {
    /* silent */
  }
}

async function loadPluginProcessInfos(): Promise<void> {
  if (!metricsChannel?.ready.value || !statusChannel?.ready.value) return;
  statusChannel.emit('get-plugin-process-status');
  try {
    state.pluginsProcessInfos = await metricsChannel.request<WorkerProcesses>('get-plugins-process-info');
  } catch {
    /* silent */
  }
}

async function loadAll(): Promise<void> {
  await Promise.all([loadSystemProcessInfos(), loadCoreProcessInfos(), loadFrameWorkerProcessInfos(), loadPluginProcessInfos()]);
}

function ensureChannels(): void {
  if (metricsChannel && statusChannel) return;

  scope = effectScope(true);
  scope.run(() => {
    const m = useSocket('/metrics');
    const s = useSocket('/status');
    // Assign before onReady: onReady fires synchronously when a socket is
    // already connected, and isBothConnected()/loadAll() read these module vars.
    metricsChannel = m;
    statusChannel = s;

    m.on<AllProcesses>('process-infos-realtime', applyRealtimeProcessInfos);
    m.on<AllProcesses>('process-infos', applyProcessInfos);
    m.on<ProcessInfo>('system-infos-realtime', (data) => {
      state.systemProcess = [data];
    });
    m.on<ProcessInfo>('system-infos', (data) => {
      state.systemProcessInfo.push(data);
      state.systemProcessInfo = state.systemProcessInfo.slice(-MAX_METRICS_DATA_POINTS);
    });

    s.on<ServerRuntime>('process-status', (data) => {
      if (data['camera.ui']) state.serverStatus = data['camera.ui'].status;
      if (data.go2rtc) state.go2rtcStatus = data.go2rtc.status;
      if (data.nats) state.natsStatus = data.nats.status;
    });
    s.on<Record<string, PluginRuntimeInfo>>('frameworker-process-status', (runtime) => {
      for (const [name, info] of Object.entries(runtime)) state.frameWorkerStatus[name] = info;
    });
    s.on<Record<string, PluginRuntimeInfo>>('plugin-process-status', (runtime) => {
      for (const [name, info] of Object.entries(runtime)) state.pluginsStatus[name] = info;
    });

    m.onReady(() => {
      if (isBothConnected()) loadAll();
    });
    s.onReady(() => {
      if (isBothConnected()) loadAll();
    });
  });
}

export function useMetricsSocket() {
  function connect(): void {
    ensureChannels();
    if (isBothConnected()) loadAll();
  }

  function disconnect(): void {
    // Channel teardown is global via resetMetricsSocket().
  }

  return {
    isConnected: computed(() => isBothConnected()),

    systemProcess: computed(() => state.systemProcess),
    systemProcessInfo: computed(() => state.systemProcessInfo),

    serverStatus: computed(() => state.serverStatus),
    go2rtcStatus: computed(() => state.go2rtcStatus),
    natsStatus: computed(() => state.natsStatus),
    coreProcesses: computed(() => state.coreProcesses),
    coreProcessInfos: computed(() => state.coreProcessInfos),

    frameWorkerStatus: computed(() => state.frameWorkerStatus),
    frameWorkersProcess: computed(() => state.frameWorkersProcess),
    frameWorkersProcessInfos: computed(() => state.frameWorkersProcessInfos),

    pluginsStatus: computed(() => state.pluginsStatus),
    pluginsProcesses: computed(() => state.pluginsProcesses),
    pluginsProcessInfos: computed(() => state.pluginsProcessInfos),

    connect,
    disconnect,
    loadAll,
    loadSystemProcessInfos,
    loadCoreProcessInfos,
    loadFrameWorkerProcessInfos,
    loadPluginProcessInfos,
  };
}

export function resetMetricsSocket(): void {
  scope?.stop();
  scope = null;
  metricsChannel = null;
  statusChannel = null;
  Object.assign(state, makeInitialState());
}
