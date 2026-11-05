import type { DBCamera } from '@shared/types';

export interface CuiCameraRecordingsProps {
  cameraId: string;
  cameraName: string;
  camera?: DBCamera;
}

export interface CuiCameraRecordingsEmits {
  scrollToEvent: [timestamp: number];
}

export interface CameraRecordingsFilterState {
  search: string;
  day?: Date;
  minConfidence: number;
  types: string[];
  sensorEvents: string[];
  audioLabels: string[];
  vehicleColors: string[];
  vehicleTypes: string[];
}

export const CAMERA_RECORDINGS_FILTER_DEFAULTS: Readonly<CameraRecordingsFilterState> = {
  search: '',
  minConfidence: 0,
  types: [],
  sensorEvents: [],
  audioLabels: [],
  vehicleColors: [],
  vehicleTypes: [],
};
