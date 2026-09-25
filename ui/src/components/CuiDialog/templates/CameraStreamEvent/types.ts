import type { SimilarSearchRequest } from '@/components/CuiSimilarPicker/types.js';
import type { DBCamera } from '@shared/types';

export interface CameraStreamEventProps {
  camera: DBCamera;
  eventTimestamp?: number;
  similarRequest?: SimilarSearchRequest;
}
