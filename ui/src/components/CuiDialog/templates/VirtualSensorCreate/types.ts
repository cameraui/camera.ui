import type { VirtualSensorType } from '@shared/types';

export interface VirtualSensorCreateProps {
  cameraId: string;
}

export interface VirtualSensorCreateResult {
  cameraId: string;
  type: VirtualSensorType;
  name: string;
}
