import { PLUGIN_STATUS } from '@shared/types';

import type { SocketChannel, SocketUnsubscribe } from '@/connection/index.js';
import type { PluginRuntimeInfo } from '@shared/types';

export interface PluginsSocketState {
  status: PLUGIN_STATUS;
  statusColor: string;
}

const DISPOSAL_GRACE_MS = 5_000;

const pluginStates = new Map<string, PluginsSocketState>();
const pluginRefCounts = new Map<string, number>();
const pluginDisposalTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pluginListeners = new Map<string, SocketUnsubscribe>();

let scope: ReturnType<typeof effectScope> | null = null;
let channel: SocketChannel | null = null;

function updateStatusColor(state: PluginsSocketState, status: PLUGIN_STATUS): void {
  switch (status) {
    case PLUGIN_STATUS.ERROR:
      state.statusColor = '#9d5752';
      break;
    case PLUGIN_STATUS.STARTING:
      state.statusColor = 'orange';
      break;
    case PLUGIN_STATUS.READY:
      state.statusColor = 'yellow';
      break;
    case PLUGIN_STATUS.STARTED:
      state.statusColor = 'green';
      break;
    case PLUGIN_STATUS.STOPPED:
      state.statusColor = 'red';
      break;
    case PLUGIN_STATUS.DISABLED:
    case PLUGIN_STATUS.UNKNOWN:
    default:
      state.statusColor = 'gray';
      break;
  }
}

function applyStatus(pluginName: string, data: PluginRuntimeInfo): void {
  const state = pluginStates.get(pluginName);
  if (!state) return;
  state.status = data.status;
  updateStatusColor(state, data.status);
}

async function refetchStatus(pluginName: string): Promise<void> {
  if (!channel?.ready.value) return;
  try {
    const data = await channel.request<PluginRuntimeInfo>('get-plugin-status', pluginName);
    applyStatus(pluginName, data);
  } catch {
    // server unreachable — next reconnect will retry via 'connect' handler
  }
}

function ensureChannel(): SocketChannel {
  if (channel) return channel;

  scope = effectScope(true);
  scope.run(() => {
    const ch = useSocket('/plugins');
    // Assign before onReady: onReady fires synchronously when the socket is
    // already connected, and refetchStatus() reads the module-level `channel`.
    channel = ch;

    ch.onReady(() => {
      // Re-fetch status for every tracked plugin — covers reconnect after
      // outage AND endpoint swap (channel internal rebind).
      for (const name of pluginStates.keys()) {
        refetchStatus(name);
      }
    });
  });

  return channel!;
}

function ensurePluginListener(pluginName: string): void {
  if (pluginListeners.has(pluginName)) return;
  const ch = ensureChannel();
  const unsub = ch.on<PluginRuntimeInfo>(`plugin-status-${pluginName}`, (data) => applyStatus(pluginName, data));
  pluginListeners.set(pluginName, unsub);
}

export function usePluginsSocket(pluginName: string) {
  const existingTimer = pluginDisposalTimers.get(pluginName);
  if (existingTimer) {
    clearTimeout(existingTimer);
    pluginDisposalTimers.delete(pluginName);
  }

  if (!pluginStates.has(pluginName)) {
    pluginStates.set(
      pluginName,
      reactive<PluginsSocketState>({
        status: PLUGIN_STATUS.UNKNOWN,
        statusColor: 'gray',
      }),
    );
  }
  const state = pluginStates.get(pluginName)!;
  pluginRefCounts.set(pluginName, (pluginRefCounts.get(pluginName) ?? 0) + 1);

  function connect(): void {
    ensureChannel();
    ensurePluginListener(pluginName);
    if (channel?.connected.value) refetchStatus(pluginName);
  }

  function fetchStatus(): void {
    refetchStatus(pluginName);
  }

  tryOnScopeDispose(() => {
    const count = (pluginRefCounts.get(pluginName) ?? 1) - 1;
    pluginRefCounts.set(pluginName, count);
    if (count > 0) return;

    const timer = setTimeout(() => {
      if ((pluginRefCounts.get(pluginName) ?? 0) <= 0) {
        const off = pluginListeners.get(pluginName);
        off?.();
        pluginListeners.delete(pluginName);
        pluginStates.delete(pluginName);
        pluginRefCounts.delete(pluginName);
        pluginDisposalTimers.delete(pluginName);
      }
    }, DISPOSAL_GRACE_MS);
    pluginDisposalTimers.set(pluginName, timer);
  });

  return {
    isConnected: computed(() => channel?.connected.value ?? false),
    status: computed(() => state.status),
    statusColor: computed(() => state.statusColor),

    connect,
    fetchStatus,
  };
}

export function resetPluginsSocket(): void {
  for (const timer of pluginDisposalTimers.values()) clearTimeout(timer);
  pluginDisposalTimers.clear();
  for (const off of pluginListeners.values()) off();
  pluginListeners.clear();
  pluginStates.clear();
  pluginRefCounts.clear();
  scope?.stop();
  scope = null;
  channel = null;
}
