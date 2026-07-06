import type { DBCamera } from '@shared/types';

export interface CuiCameraRecordingsProps {
  cameraId: string;
  cameraName: string;
  camera?: DBCamera;
  compact?: boolean;
}

export interface CuiCameraRecordingsEmits {
  scrollToEvent: [timestamp: number];
}
