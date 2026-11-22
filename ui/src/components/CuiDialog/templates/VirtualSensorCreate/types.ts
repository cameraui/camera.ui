import type { VirtualDeviceChoice } from '@/components/CuiVirtualDeviceField/types.js';
import type { VirtualSensorType } from '@shared/types';

export interface VirtualSensorCreateProps {
  cameraId?: string;
  devices: { label: string; value: string }[];
}

export interface VirtualSensorCreateResult {
  cameraId?: string;
  type: VirtualSensorType;
  name: string;
  capabilities: string[];
  sources?: string[];
  kind?: string;
  exposed: boolean;
  device: VirtualDeviceChoice;
}
