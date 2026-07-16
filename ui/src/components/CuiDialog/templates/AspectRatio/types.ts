import type { DBCamera } from '@shared/types';

export interface AspectRatioProps {
  camera: DBCamera;
  current: string;
  presets: string[];
}
