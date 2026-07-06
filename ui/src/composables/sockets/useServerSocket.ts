import type { SocketChannel } from '@/connection/index.js';
import type { INpmPluginState } from '@shared/types';

export interface ServerSocketState {
  serverUpdateAvailable: boolean;
  pluginUpdateAvailable: boolean;
  serverUpdate: INpmPluginState | null;
  pluginUpdates: INpmPluginState[];
}

const state = reactive<ServerSocketState>({
  serverUpdateAvailable: false,
  pluginUpdateAvailable: false,
  serverUpdate: null,
  pluginUpdates: [],
});

let scope: ReturnType<typeof effectScope> | null = null;
let channel: SocketChannel | null = null;

async function fetchUpdates(): Promise<void> {
  if (!channel?.ready.value) return;
  try {
    const data = await channel.request<{ plugins: INpmPluginState[]; server: INpmPluginState }>('get-updates');
    state.pluginUpdates = data.plugins;
    state.pluginUpdateAvailable = data.plugins.length > 0;
    state.serverUpdate = data.server;
    state.serverUpdateAvailable = data.server.updateAvailable || data.server.betaUpdateAvailable || false;
  } catch {
    // server unreachable — reconnect path fetches again
  }
}

function ensureChannel(): SocketChannel {
  if (channel) return channel;

  scope = effectScope(true);
  scope.run(() => {
    const ch = useSocket('/server');
    // Assign before onReady: onReady fires synchronously when the socket is
    // already connected, and fetchUpdates() reads the module-level `channel`.
    channel = ch;

    ch.on<INpmPluginState[]>('plugin-updates', (plugins) => {
      state.pluginUpdates = plugins;
      state.pluginUpdateAvailable = plugins.length > 0;
    });

    ch.on<INpmPluginState>('server-updates', (server) => {
      state.serverUpdate = server;
      state.serverUpdateAvailable = server.updateAvailable || server.betaUpdateAvailable || false;
    });

    ch.onReady(() => {
      fetchUpdates();
    });
  });

  return channel!;
}

export function useServerSocket() {
  function connect(): void {
    ensureChannel();
  }

  function disconnect(): void {
    // Channel teardown is global via resetServerSocket().
  }

  return {
    isConnected: computed(() => channel?.connected.value ?? false),
    serverUpdateAvailable: computed(() => state.serverUpdateAvailable),
    pluginUpdateAvailable: computed(() => state.pluginUpdateAvailable),
    serverUpdate: computed(() => state.serverUpdate),
    pluginUpdates: computed(() => state.pluginUpdates),
    connect,
    disconnect,
    fetchUpdates,
  };
}

export function resetServerSocket(): void {
  scope?.stop();
  scope = null;
  channel = null;
  state.serverUpdateAvailable = false;
  state.pluginUpdateAvailable = false;
  state.serverUpdate = null;
  state.pluginUpdates = [];
}
