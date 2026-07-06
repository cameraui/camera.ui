import type { MotionResolution } from '@camera.ui/sdk';

export type PixelFormat = 'yuv420p' | 'rgb24' | 'nv12';

export const MOTION_WIDTH_MAP: Record<MotionResolution, number> = {
  low: 320,
  medium: 480,
  high: 640,
};

export interface WorkerToMainMessage {
  message: 'started';
  data: Record<string, any>;
}
