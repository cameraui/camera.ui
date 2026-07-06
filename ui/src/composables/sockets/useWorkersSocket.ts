import type { WorkerInfo } from '@/api/routes/workers.js';
import type { SocketChannel } from '@/connection/index.js';

export const MAX_WORKERS_DATA_POINTS = 30;

export interface WorkersSocketState {
  workers: WorkerInfo[];
  workerHistory: Record<string, WorkerInfo[]>;
}

const state = reactive<WorkersSocketState>({
  workers: [],
  workerHistory: {},
});

let scope: ReturnType<typeof effectScope> | null = null;
let channel: SocketChannel | null = null;

function applyWorkerUpdate(worker: WorkerInfo): void {
  const index = state.workers.findIndex((w) => w.agentId === worker.agentId);
  if (index !== -1) {
    const updated = [...state.workers];
    updated[index] = worker;
    state.workers = updated;
  } else {
    state.workers = [...state.workers, worker];
  }
  const current = state.workerHistory[worker.agentId] ?? [];
  state.workerHistory = {
    ...state.workerHistory,
    [worker.agentId]: [...current, worker].slice(-MAX_WORKERS_DATA_POINTS),
  };
}

async function loadWorkers(): Promise<void> {
  if (!channel?.ready.value) return;
  try {
    state.workers = await channel.request<WorkerInfo[]>('get-workers');
  } catch {
    // server unreachable
  }
}

async function loadWorkerHistory(): Promise<void> {
  if (!channel?.ready.value) return;
  try {
    state.workerHistory = await channel.request<Record<string, WorkerInfo[]>>('get-worker-history');
  } catch {
    // server unreachable
  }
}

async function loadAll(): Promise<void> {
  await Promise.all([loadWorkers(), loadWorkerHistory()]);
}

function ensureChannel(): SocketChannel {
  if (channel) return channel;

  scope = effectScope(true);
  scope.run(() => {
    const ch = useSocket('/workers');
    // Assign before onReady: onReady fires synchronously when the socket is
    // already connected, and loadAll() reads the module-level `channel`.
    channel = ch;

    ch.on<WorkerInfo>('worker-update', (worker) => applyWorkerUpdate(worker));

    ch.on<{ agentId: string }>('worker-removed', ({ agentId }) => {
      state.workers = state.workers.filter((worker) => worker.agentId !== agentId);
      const history = { ...state.workerHistory };
      delete history[agentId];
      state.workerHistory = history;
    });

    ch.onReady(() => {
      loadAll();
    });
  });

  return channel!;
}

export function useWorkersSocket() {
  function connect(): void {
    ensureChannel();
  }

  function disconnect(): void {
    // Channel teardown is global via resetWorkersSocket().
  }

  return {
    isConnected: computed(() => channel?.connected.value ?? false),
    workers: computed(() => state.workers),
    workerHistory: computed(() => state.workerHistory),

    connect,
    disconnect,
    loadAll,
  };
}

export function resetWorkersSocket(): void {
  scope?.stop();
  scope = null;
  channel = null;
  state.workers = [];
  state.workerHistory = {};
}
