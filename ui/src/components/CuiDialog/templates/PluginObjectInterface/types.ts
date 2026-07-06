import type { ClassifierDetectionPluginResponse, FaceDetectionPluginResponse, LicensePlateDetectionPluginResponse, ObjectDetectionPluginResponse } from '@camera.ui/sdk';

export interface PluginObjectInterfaceProps {
  src: HTMLMediaElement['src'];
  response: ObjectDetectionPluginResponse | FaceDetectionPluginResponse | LicensePlateDetectionPluginResponse | ClassifierDetectionPluginResponse;
}
