import type { TransformedSensor, TransformedSensorDevice } from '@shared/types';

export interface SensorEditProps {
  sensor: TransformedSensor;
  cameraOptions: { label: string; value: string }[];
  // the sensor is alone in this device, its name field names the device
  device?: TransformedSensorDevice;
  devices: { label: string; value: string }[];
}

export interface SensorEditResult {
  displayName: string;
  assignedCameraIds: string[];
  exposed: boolean;
  deviceId?: string | null;
  newDeviceName?: string;
}
