import type { SocketChannel } from '@/connection/index.js';
import type { DiscoveredSensorListItem, SensorDiscoveryEvents } from '@shared/types';

export interface SensorsSocketState {
  isLoading: boolean;
  sensors: DiscoveredSensorListItem[];
  isScanning: boolean;
  error: string | null;
}

interface SubscribeResult {
  success: boolean;
  sensors?: DiscoveredSensorListItem[];
  isScanning?: boolean;
}

interface RescanResult {
  success: boolean;
  error?: string;
}

interface AdoptResult {
  success: boolean;
  error?: string;
}

const DISPOSAL_GRACE_MS = 5_000;

const state = reactive<SensorsSocketState>({
  isLoading: true,
  sensors: [],
  isScanning: false,
  error: null,
});

let scope: ReturnType<typeof effectScope> | null = null;
let channel: SocketChannel | null = null;
let isSubscribed = false;
let refCount = 0;
let disposalTimer: ReturnType<typeof setTimeout> | null = null;

function resetState(): void {
  state.isLoading = true;
  state.sensors = [];
  state.isScanning = false;
  state.error = null;
}

function ensureChannel(): SocketChannel {
  if (channel) return channel;

  scope = effectScope(true);
  scope.run(() => {
    const ch = useSocket('/sensors');
    channel = ch;

    ch.onReady(() => {
      subscribeInternal();
    });
    watch(ch.connected, (connected, was) => {
      if (!connected && was) isSubscribed = false;
    });

    ch.on<SensorDiscoveryEvents['sensors:discovered']>('sensors:discovered', (data) => {
      state.sensors = [...state.sensors.filter((s) => s.pluginId !== data.source), ...data.sensors];
    });

    ch.on<SensorDiscoveryEvents['sensors:scanning']>('sensors:scanning', (data) => {
      state.isScanning = data.isScanning;
    });

    ch.on<SensorDiscoveryEvents['sensors:adopted']>('sensors:adopted', (data) => {
      state.sensors = state.sensors.filter((s) => !(s.pluginId === data.pluginId && s.id === data.id));
    });
  });

  return channel!;
}

async function subscribeInternal(): Promise<SubscribeResult> {
  if (!channel || isSubscribed) {
    return { success: isSubscribed, sensors: state.sensors, isScanning: state.isScanning };
  }
  try {
    const result = await channel.request<SubscribeResult>('sensors:subscribe', {});
    isSubscribed = result.success;
    if (result.sensors) state.sensors = result.sensors;
    if (result.isScanning !== undefined) state.isScanning = result.isScanning;
    state.isLoading = false;
    return result;
  } catch (err) {
    state.isLoading = false;
    state.error = err instanceof Error ? err.message : 'subscribe failed';
    return { success: false };
  }
}

async function unsubscribeInternal(): Promise<{ success: boolean }> {
  if (!channel || !isSubscribed) return { success: true };
  try {
    const result = await channel.request<{ success: boolean }>('sensors:unsubscribe', {});
    isSubscribed = !result.success;
    return result;
  } catch {
    return { success: false };
  }
}

function teardown(): void {
  if (isSubscribed) {
    unsubscribeInternal();
  }
  scope?.stop();
  scope = null;
  channel = null;
  isSubscribed = false;
  resetState();
}

export function useSensorsSocket() {
  if (disposalTimer) {
    clearTimeout(disposalTimer);
    disposalTimer = null;
  }
  refCount++;

  function connect(): void {
    ensureChannel();
    if (channel?.connected.value && !isSubscribed) {
      subscribeInternal();
    }
  }

  function disconnect(): void {
    if (isSubscribed) {
      unsubscribeInternal();
    }
  }

  async function forceRescan(): Promise<RescanResult> {
    if (!channel?.ready.value) return { success: false, error: 'Not connected' };
    state.sensors = [];
    state.isScanning = true;
    try {
      const result = await channel.request<RescanResult>('sensors:rescan', {});
      if (!result.success) state.isScanning = false;
      return result;
    } catch (err) {
      state.isScanning = false;
      return { success: false, error: err instanceof Error ? err.message : 'rescan failed' };
    }
  }

  async function adoptSensor(item: DiscoveredSensorListItem): Promise<AdoptResult> {
    if (!channel?.ready.value) return { success: false, error: 'Not connected' };
    const { pluginId, pluginName: _pluginName, ...sensor } = item;
    try {
      return await channel.request<AdoptResult>('sensors:adopt', { pluginId, sensor });
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'adopt failed' };
    }
  }

  const sortedSensors = computed(() => [...state.sensors].sort((a, b) => a.name.localeCompare(b.name)));

  tryOnScopeDispose(() => {
    refCount--;
    if (refCount > 0) return;
    refCount = 0;
    disposalTimer = setTimeout(() => {
      if (refCount <= 0) {
        teardown();
        disposalTimer = null;
      }
    }, DISPOSAL_GRACE_MS);
  });

  return {
    state: readonly(state),
    isConnected: computed(() => channel?.connected.value ?? false),
    isLoading: computed(() => state.isLoading),
    sensors: computed(() => state.sensors),
    isScanning: computed(() => state.isScanning),
    error: computed(() => state.error),

    sortedSensors,

    connect,
    disconnect,
    subscribe: subscribeInternal,
    unsubscribe: unsubscribeInternal,
    forceRescan,
    adoptSensor,
  };
}
