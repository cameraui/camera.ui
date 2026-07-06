import type { AudioMetadata, ImageMetadata } from '@camera.ui/sdk';

export interface CuiDetectionInterfaceProps {
  type: 'objectDetection' | 'motionDetection' | 'audioDetection' | 'faceDetection' | 'licensePlateDetection' | 'classifierDetection' | 'clipDetection';
  pluginName: string;
}

export interface CuiDetectionInterfaceEmits {
  (e: 'update:file', file: File | null): void;
  (e: 'update:metadata', metadata: ImageMetadata | AudioMetadata | null): void;
}
