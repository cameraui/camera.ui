import type { TransformedSensor, TransformedSensorDevice } from '@shared/types';

export interface SensorEditProps {
  sensor: TransformedSensor;
  cameraOptions: { label: string; value: string }[];
  // the sensor is alone in this device, its name field names the device
  device?: TransformedSensorDevice;
}

export interface SensorEditResult {
  displayName: string;
  assignedCameraIds: string[];
  exposed: boolean;
}
