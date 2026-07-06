import type { CameraInformation, CameraType } from '@camera.ui/sdk';
import type { DBCamera } from '@shared/types';
import type { Go2RtcModel } from '@/common/cameraSources.js';

export interface ConfirmCameraProps {
  draft: DBCamera;
  onConfirm: (draft: DBCamera) => Promise<void>;
}

export interface ConfirmCameraForm {
  name: string;
  type: CameraType;
  room: string;
  info: CameraInformation;
  sources: Go2RtcModel[];
}
