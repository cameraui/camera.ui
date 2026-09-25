import type { FrameObject, SimilarQuery } from '@camera.ui/nvr';
import type { DBCamera } from '@shared/types';

export interface CuiSimilarPickerProps {
  camera: DBCamera;
  frame?: Blob;
}

export interface CuiSimilarPickerEmits {
  pick: [object: FrameObject & { query: SimilarQuery }];
  close: [];
}

export interface SimilarSearchRequest {
  query: SimilarQuery;
  objectLabel: string;
  crop?: string;
}
