import type { ReactiveCameraDevice } from '@camera.ui/browser';
import type { CameraInputSettings } from '@camera.ui/sdk/internal';
import type { DBCamera } from '@shared/types';

export interface CameraOptionsProps {
  cameraName: string;
  latestSnapshotSrc?: string;
}

export interface CameraOptionsEmits {
  (e: 'close'): void;
}

export interface CameraOptionsTabProps {
  camera: DBCamera;
  cameraDevice: ReactiveCameraDevice;
  loading: boolean;
  latestSnapshotSrc?: string;
}

export interface CameraOptionsTabEmits {
  (e: 'close'): void;
}

export interface CameraSourceProps {
  cameraId: string;
  cameraName: string;
  source: CameraInputSettings;
  loading?: boolean;
}

export interface CameraOptionsSegment {
  name: string;
  icon: string;
}

export interface OverviewRow {
  label: string;
  value: string;
  tag?: boolean;
  tagSeverity?: 'success' | 'warn' | 'danger' | 'secondary' | 'contrast';
}

export interface ChildSourceOption {
  label: string;
  value: string | undefined;
}
