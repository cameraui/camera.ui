import type { ClassifierDetection, Detection, DetectionLabel, FaceDetection, LicensePlateDetection } from '@camera.ui/sdk';

export type AnyDetection = Detection | FaceDetection | LicensePlateDetection | ClassifierDetection;

export interface CuiBBoxPlaygroundProps {
  showIcon?: boolean;
  showLabel?: boolean;
  showConfidence?: boolean;
  highlightArea?: boolean;
  detections?: AnyDetection[];
  classes?: DetectionLabel[];
}
