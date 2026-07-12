import { randomLetter } from '@/common/utils.js';

import type { AssignedPlugin, CameraInformation, CameraType, CameraUiSettings, PluginAssignments } from '@camera.ui/sdk';
import type { Go2RtcModel } from '@/common/cameraSources.js';

export type { Go2RtcModel } from '@/common/cameraSources.js';

export interface CameraFormModel {
  disabled: boolean;
  name: string;
  type: CameraType;
  room: string;
  info: CameraInformation;
  sources: Go2RtcModel[];
  interfaceSettings: CameraUiSettings;
  plugins: AssignedPlugin[];
  assignments: PluginAssignments;
}

export interface CameraFormModelInput extends CameraFormModel {
  _id: string;
}

export interface AddCameraProps {
  camera?: CameraFormModel;
}

export const DEFAULT_CAMERA: CameraFormModel = {
  disabled: false,
  name: '',
  type: 'camera',
  room: 'Default',
  info: {
    manufacturer: '',
    model: '',
    hardware: '',
    serialNumber: '',
    firmwareVersion: '',
    supportUrl: '',
  },
  sources: [
    {
      _id: randomLetter(8),
      name: '',
      role: 'high-resolution',
      urls: [''],
      useForSnapshot: false,
      hotMode: true,
      preload: true,
      muted: false,
    },
  ],
  interfaceSettings: {
    streamingMode: 'webrtc',
    streamingSource: 'high-resolution',
    aspectRatio: '16:9',
  },
  plugins: [],
  assignments: {},
};
