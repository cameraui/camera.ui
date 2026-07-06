import type { DBCamera } from '@shared/types';

export interface CameraStreamEventProps {
  camera: DBCamera;
  eventTimestamp?: number;
}
