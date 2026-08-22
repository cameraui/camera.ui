import type { CameraInformation, CameraType } from '@camera.ui/sdk';

export interface CameraDetailsForm {
  name: string;
  type: CameraType;
  room: string;
  roomId: string | null;
  info: CameraInformation;
}

export interface CuiCameraDetailsFieldsProps {
  form: CameraDetailsForm;
  isLoading: boolean;
}
