import type { SocketChannel } from '@/connection/index.js';
import type { JsonSchemaWithoutCallbacks } from '@camera.ui/sdk';
import type { DBCamera, DeviceListItem, DiscoveryManagerProxyEvents } from '@shared/types';

export interface HiddenDevice {
  id: string;
  name: string;
  model?: string;
}

export interface CamerasSocketState {
  isLoading: boolean;
  devices: DeviceListItem[];
  isScanning: boolean;
  hiddenDevices: HiddenDevice[];
  showHidden: boolean;
  error: string | null;
}

interface SubscribeResult {
  success: boolean;
  devices?: DeviceListItem[];
  isScanning?: boolean;
  hiddenDevices?: HiddenDevice[];
}

interface RescanResult {
  success: boolean;
  error?: string;
}

interface SchemaResult {
  success: boolean;
  schema?: JsonSchemaWithoutCallbacks[];
  error?: string;
}

interface ConnectDeviceResult {
  success: boolean;
  cameraId?: string;
  cameraName?: string;
  error?: string;
}

interface PrepareDeviceResult {
  success: boolean;
  draft?: DBCamera;
  error?: string;
}

interface ConfirmDeviceResult {
  success: boolean;
  cameraId?: string;
  cameraName?: string;
  error?: string;
}

interface HiddenDevicesResult {
  success: boolean;
  hiddenDevices?: HiddenDevice[];
  error?: string;
}

const DISPOSAL_GRACE_MS = 5_000;

const state = reactive<CamerasSocketState>({
  isLoading: true,
  devices: [],
  isScanning: false,
  hiddenDevices: [],
  showHidden: false,
  error: null,
});

let scope: ReturnType<typeof effectScope> | null = null;
let channel: SocketChannel | null = null;
let isSubscribed = false;
let refCount = 0;
let disposalTimer: ReturnType<typeof setTimeout> | null = null;

function resetState(): void {
  state.isLoading = true;
  state.devices = [];
  state.isScanning = false;
  state.hiddenDevices = [];
  state.showHidden = false;
  state.error = null;
}

function ensureChannel(): SocketChannel {
  if (channel) return channel;

  scope = effectScope(true);
  scope.run(() => {
    const ch = useSocket('/cameras');
    // Assign before onReady: onReady fires synchronously when the socket is
    // already connected, and subscribeInternal() reads the module-level `channel`.
    channel = ch;

    ch.onReady(() => {
      subscribeInternal();
    });
    watch(ch.connected, (connected, was) => {
      if (!connected && was) isSubscribed = false;
    });

    ch.on<DiscoveryManagerProxyEvents['cameras:discovered']>('cameras:discovered', (data) => {
      // Streaming: cameras arrive as each source completes — merge instead of replace
      for (const device of data.devices) {
        const existingIndex = state.devices.findIndex((d) => d.id === device.id);
        if (existingIndex >= 0) {
          state.devices[existingIndex] = device;
        } else {
          state.devices.push(device);
        }
      }
    });

    ch.on<DiscoveryManagerProxyEvents['cameras:scanning']>('cameras:scanning', (data) => {
      // Don't clear devices on scanning state change — allows users to see
      // cached devices during rescan.
      state.isScanning = data.isScanning;
    });

    ch.on<DiscoveryManagerProxyEvents['cameras:connection-status']>('cameras:connection-status', (data) => {
      const device = state.devices.find((d) => d.discoveredId === data.discoveredId);
      if (!device) return;
      if (data.status === 'connecting') {
        device.status = 'adopting';
      } else if (data.status === 'error') {
        device.status = 'error';
        device.errorMessage = data.errorMessage;
      } else if (data.status === 'connected') {
        state.devices = state.devices.filter((d) => d.discoveredId !== data.discoveredId);
      }
    });

    ch.on<DiscoveryManagerProxyEvents['cameras:camera-connected']>('cameras:camera-connected', (data) => {
      state.devices = state.devices.filter((d) => d.discoveredId !== data.discoveredId);
    });

    ch.on<DiscoveryManagerProxyEvents['cameras:deleted']>('cameras:deleted', (data) => {
      state.devices = state.devices.filter((d) => d.cameraId !== data.cameraId);
    });
  });

  return channel!;
}

async function subscribeInternal(): Promise<SubscribeResult> {
  if (!channel || isSubscribed) {
    return { success: isSubscribed, devices: state.devices, isScanning: state.isScanning, hiddenDevices: state.hiddenDevices };
  }
  try {
    const result = await channel.request<SubscribeResult>('cameras:subscribe', {});
    isSubscribed = result.success;
    if (result.devices) state.devices = result.devices;
    if (result.isScanning !== undefined) state.isScanning = result.isScanning;
    if (result.hiddenDevices) state.hiddenDevices = result.hiddenDevices;
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
    const result = await channel.request<{ success: boolean }>('cameras:unsubscribe', {});
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

export function useCamerasSocket() {
  if (disposalTimer) {
    clearTimeout(disposalTimer);
    disposalTimer = null;
  }
  refCount++;

  function connect(): void {
    ensureChannel();
    // If the channel is already connected when we attach (subsequent caller
    // joining an existing session), 'connect' won't refire — subscribe now.
    if (channel?.connected.value && !isSubscribed) {
      subscribeInternal();
    }
  }

  function disconnect(): void {
    // Refcount path handles teardown — direct disconnect just unsubscribes
    // server-side but leaves the channel alive for other callers.
    if (isSubscribed) {
      unsubscribeInternal();
    }
  }

  async function forceRescan(): Promise<RescanResult> {
    if (!channel?.ready.value) return { success: false, error: 'Not connected' };
    state.devices = [];
    state.isScanning = true;
    try {
      const result = await channel.request<RescanResult>('cameras:rescan', {});
      if (!result.success) state.isScanning = false;
      return result;
    } catch (err) {
      state.isScanning = false;
      return { success: false, error: err instanceof Error ? err.message : 'rescan failed' };
    }
  }

  async function getConnectionSchema(discoveredId: string): Promise<SchemaResult> {
    if (!channel?.ready.value) return { success: false, error: 'Not connected' };
    try {
      return await channel.request<SchemaResult>('cameras:get-schema', { discoveredId });
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'get-schema failed' };
    }
  }

  async function connectDevice(discoveredId: string, credentials: Record<string, unknown>): Promise<ConnectDeviceResult> {
    if (!channel?.ready.value) return { success: false, error: 'Not connected' };
    try {
      return await channel.request<ConnectDeviceResult>('cameras:connect', { discoveredId, credentials });
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'connect failed' };
    }
  }

  async function prepareDevice(discoveredId: string, credentials: Record<string, unknown>): Promise<DBCamera> {
    if (!channel?.ready.value) throw new Error('Not connected');
    const result = await channel.request<PrepareDeviceResult>('cameras:prepare', { discoveredId, credentials });
    if (!result.success || !result.draft) {
      throw new Error(result.error ?? 'prepare failed');
    }
    return result.draft;
  }

  async function confirmDevice(draft: DBCamera, discoveredId?: string): Promise<{ cameraId: string; cameraName: string }> {
    if (!channel?.ready.value) throw new Error('Not connected');
    const result = await channel.request<ConfirmDeviceResult>('cameras:confirm', { draft, discoveredId });
    if (!result.success || !result.cameraId || !result.cameraName) {
      throw new Error(result.error ?? 'confirm failed');
    }
    return { cameraId: result.cameraId, cameraName: result.cameraName };
  }

  async function hideDevice(device: DeviceListItem): Promise<HiddenDevicesResult> {
    if (!channel?.ready.value) return { success: false, error: 'Not connected' };
    const hiddenDevice: HiddenDevice = {
      id: device.discoveredId!,
      name: device.name,
      model: device.model,
    };
    try {
      const result = await channel.request<HiddenDevicesResult>('cameras:hide-device', { device: hiddenDevice });
      if (result.success && result.hiddenDevices) state.hiddenDevices = result.hiddenDevices;
      return result;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'hide-device failed' };
    }
  }

  async function unhideDevice(deviceId: string): Promise<HiddenDevicesResult> {
    if (!channel?.ready.value) return { success: false, error: 'Not connected' };
    try {
      const result = await channel.request<HiddenDevicesResult>('cameras:unhide-device', { deviceId });
      if (result.success && result.hiddenDevices) state.hiddenDevices = result.hiddenDevices;
      return result;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'unhide-device failed' };
    }
  }

  function toggleShowHidden(): void {
    state.showHidden = !state.showHidden;
  }

  function isHidden(device: DeviceListItem): boolean {
    if (device.type !== 'discovered' || !device.discoveredId) return false;
    return state.hiddenDevices.some((h) => h.id === device.discoveredId);
  }

  const sortedDevices = computed(() => {
    const hiddenIds = new Set(state.hiddenDevices.map((d) => d.id));
    const byName = (a: DeviceListItem, b: DeviceListItem): number => a.name.localeCompare(b.name);
    const existing = state.devices.filter((d) => d.type === 'camera').sort(byName);
    const discovered = state.devices.filter((d) => d.type === 'discovered' && !hiddenIds.has(d.discoveredId!)).sort(byName);
    const hidden = state.showHidden ? state.devices.filter((d) => d.type === 'discovered' && hiddenIds.has(d.discoveredId!)).sort(byName) : [];
    return [...existing, ...discovered, ...hidden];
  });

  tryOnScopeDispose(() => {
    refCount--;
    if (refCount > 0) return;
    refCount = 0;
    // Grace period for view transitions — if a new view picks up the same
    // socket within DISPOSAL_GRACE_MS, we skip teardown.
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
    devices: computed(() => state.devices),
    isScanning: computed(() => state.isScanning),
    hiddenDevices: computed(() => state.hiddenDevices),
    showHidden: computed(() => state.showHidden),
    error: computed(() => state.error),

    sortedDevices,

    connect,
    disconnect,
    subscribe: subscribeInternal,
    unsubscribe: unsubscribeInternal,
    forceRescan,
    getConnectionSchema,
    connectDevice,
    prepareDevice,
    confirmDevice,
    hideDevice,
    unhideDevice,
    toggleShowHidden,
    isHidden,
  };
}

export function resetCamerasSocket(): void {
  if (disposalTimer) {
    clearTimeout(disposalTimer);
    disposalTimer = null;
  }
  refCount = 0;
  teardown();
}
