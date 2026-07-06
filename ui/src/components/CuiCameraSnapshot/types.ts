import type { DBCamera } from '@shared/types';
import type { HTMLAttributes } from 'vue';

export interface CuiCameraSnapshotProps {
  camera: string | DBCamera;
  src?: string;
  loading?: boolean;
  showLoadingScreen?: boolean;
  width?: string;
  height?: string;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  aspectRatio?: string;
  imageStyle?: HTMLAttributes['style'];
  imageClass?: HTMLAttributes['class'];
}
