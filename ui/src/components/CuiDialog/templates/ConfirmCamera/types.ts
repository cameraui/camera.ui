import type { Go2RtcModel } from '@/common/cameraSources.js';
import type { CameraInformation, CameraType } from '@camera.ui/sdk';
import type { DBCamera } from '@shared/types';

export interface ConfirmCameraProps {
  draft: DBCamera;
  onConfirm: (draft: DBCamera) => Promise<void>;
}

export interface ConfirmCameraForm {
  name: string;
  type: CameraType;
  room: string;
  roomId: string | null;
  info: CameraInformation;
  sources: Go2RtcModel[];
}
