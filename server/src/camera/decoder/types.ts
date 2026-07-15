import type { MotionResolution, StreamingRole } from '@camera.ui/sdk';

export type PixelFormat = 'yuv420p' | 'rgb24' | 'nv12';

export interface CoordinatorSourceUrl {
  role: StreamingRole;
  url: string;
}

export const MOTION_WIDTH_MAP: Record<MotionResolution, number> = {
  low: 320,
  medium: 480,
  high: 640,
};

export const DETECT_TIMEOUT_MS = 30_000;

export interface WorkerToMainMessage {
  message: 'started';
  data: Record<string, any>;
}
