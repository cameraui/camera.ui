export type DetectionType = 'motion' | 'object' | 'audio' | 'face' | 'licensePlate';

export interface CuiDetectionProps {
  type: DetectionType;
  label?: string;
  detected?: boolean;
  detections?: string[];
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
}

export const CUI_DETECTION_DEFAULTS = {
  detected: false,
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiDetectionProps>;
