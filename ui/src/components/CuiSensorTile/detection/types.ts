import type { BoundingBox } from '@camera.ui/sdk';

export interface DetectionBox {
  key: string;
  box: BoundingBox;
  color: string;
  text?: string;
}

export interface CuiDetectionFrameProps {
  cameraId?: string;
  boxes: DetectionBox[];
  disabled?: boolean;
}

export interface CuiAudioMeterProps {
  level?: number;
  min: number;
  max: number;
  text: string;
  active: boolean;
}
