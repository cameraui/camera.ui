import type { DiscoveredCamera } from '@camera.ui/sdk';
import type { ConnectionStatus } from '@camera.ui/sdk/internal';

export type DeviceStatus = 'added' | 'discovered' | 'adopting' | 'error';

export interface DeviceListItem {
  id: string;
  name: string;
  manufacturer?: string;
  model?: string;
  provider: string;
  status: DeviceStatus;
  errorMessage?: string;

  room?: string;
  type: 'camera' | 'discovered';

  cameraId?: string;

  discoveredId?: string;
}

export interface DiscoveryManagerInterface {
  pushDiscoveredCameras(pluginId: string, cameras: DiscoveredCamera[]): Promise<void>;
}

export interface DiscoveryManagerProxyEvents {
  'cameras:discovered': { devices: DeviceListItem[]; source: string };
  'cameras:deleted': { cameraId: string; pluginId?: string };
  'cameras:scanning': { isScanning: boolean };
  'cameras:connection-status': { discoveredId: string; status: ConnectionStatus; errorMessage?: string };
  'cameras:camera-connected': { discoveredId: string; cameraId: string; cameraName: string };
}

export interface DiscoveryManagerProxyGenericEvent<K extends keyof DiscoveryManagerProxyEvents> {
  type: K;
  data: DiscoveryManagerProxyEvents[K];
}
