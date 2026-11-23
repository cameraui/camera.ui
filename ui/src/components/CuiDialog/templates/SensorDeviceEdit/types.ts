import type { TransformedSensor, TransformedSensorDevice } from '@shared/types';

export interface SensorDeviceEditProps {
  device: TransformedSensorDevice;
  sensors: TransformedSensor[];
  pluginName: string;
}

export interface SensorDeviceEditResult {
  displayName: string;
  exposed?: boolean;
  roomId?: string | null;
}
