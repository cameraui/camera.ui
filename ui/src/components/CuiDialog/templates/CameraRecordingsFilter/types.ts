import type { CameraRecordingsFilterState } from '@/components/CuiCameraRecordings/types.js';
import type { DBCamera } from '@shared/types';

export interface CameraRecordingsFilterProps {
  cameraName: string;
  camera?: DBCamera;
  filter: CameraRecordingsFilterState;
}
