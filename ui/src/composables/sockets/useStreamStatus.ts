import type { SocketChannel } from '@/connection/index.js';

export type StreamStatus = 'connected' | 'connecting' | 'error' | 'idle' | 'partial';
export type CameraStreamStatus = Record<string, Record<string, StreamStatus>>;

const POLL_INTERVAL_MS = 10_000;

const state = reactive<{ streamStatus: CameraStreamStatus }>({
  streamStatus: {},
});

let scope: ReturnType<typeof effectScope> | null = null;
let channel: SocketChannel | null = null;
let pollInterval: ReturnType<typeof setInterval> | undefined;

function refresh(): void {
  channel?.emit('get-stream-status');
}

function ensureChannel(): SocketChannel {
  if (channel) return channel;

  scope = effectScope(true);
  scope.run(() => {
    const ch = useSocket('/camera.ui');
    // Assign before onReady: onReady fires synchronously when the socket is
    // already connected, and refresh() reads the module-level `channel`.
    channel = ch;

    ch.on<CameraStreamStatus>('stream-status', (data) => {
      state.streamStatus = data;
    });

    ch.onReady(() => {
      refresh();
    });
  });

  if (!pollInterval) {
    pollInterval = setInterval(refresh, POLL_INTERVAL_MS);
  }

  return channel!;
}

function deriveCameraStatus(sources: Record<string, StreamStatus>): StreamStatus {
  const values = Object.values(sources);
  if (values.length === 0) return 'idle';
  const connectedCount = values.filter((s) => s === 'connected').length;
  const errorCount = values.filter((s) => s === 'error').length;
  const connectingCount = values.filter((s) => s === 'connecting').length;
  if (connectedCount === values.length) return 'connected';
  if (errorCount === values.length) return 'error';
  if (connectingCount > 0 && connectedCount === 0 && errorCount === 0) return 'connecting';
  if (connectedCount > 0 && (errorCount > 0 || values.some((s) => s === 'idle'))) return 'partial';
  if (connectedCount > 0) return 'connected';
  if (connectingCount > 0) return 'connecting';
  return 'idle';
}

export function useStreamStatus() {
  function connect(): void {
    ensureChannel();
  }

  function disconnect(): void {
    // Channel teardown is global via resetStreamStatus().
  }

  function getCameraStatus(cameraId: string): StreamStatus {
    const sources = state.streamStatus[cameraId];
    if (!sources) return 'idle';
    return deriveCameraStatus(sources);
  }

  function getCameraSources(cameraId: string): Record<string, StreamStatus> | undefined {
    return state.streamStatus[cameraId];
  }

  function getSourceStatus(cameraId: string, sourceName: string): StreamStatus {
    return state.streamStatus[cameraId]?.[sourceName] ?? 'idle';
  }

  return {
    streamStatus: computed(() => state.streamStatus),
    getCameraStatus,
    getCameraSources,
    getSourceStatus,
    connect,
    disconnect,
    refresh,
  };
}

export function resetStreamStatus(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = undefined;
  }
  scope?.stop();
  scope = null;
  channel = null;
  state.streamStatus = {};
}
