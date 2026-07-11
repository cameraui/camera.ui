import type { DetectionLine, DetectionZone } from '@camera.ui/sdk';

export interface ZoneEditorProps {
  cameraName: string;
  zones: DetectionZone[];
  lines: DetectionLine[];
  initialTab?: 'zones' | 'lines';
  initialSelection?: number;
}

export interface CoordsPosition {
  _id: string;
  zoneIndex: number;
  pointIndex: number;
  point: [number, number];
}

export interface LabelOption {
  label: string;
  value: string;
}

export interface LabelGroup {
  label: string;
  items: LabelOption[];
}

export const NON_SPATIAL_LABELS = ['audio'];
export const NON_TRACKED_LABELS = ['audio', 'motion'];
