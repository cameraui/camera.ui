import { SensorType } from '@camera.ui/sdk';

export const DETECTION_TYPES: readonly string[] = [
  SensorType.Motion,
  SensorType.Object,
  SensorType.Audio,
  SensorType.Face,
  SensorType.LicensePlate,
  SensorType.Classifier,
];

export const HELPER_TYPES: readonly string[] = [SensorType.Clip, SensorType.Segmenter, SensorType.FaceEmbedder, SensorType.PersonEmbedder, SensorType.ObjectAssist];
