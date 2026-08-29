import type { AlertZone, DetectionLine, MotionZone, ObjectZone, PrivacyZone } from '@camera.ui/sdk';

export interface CuiPolygonProps {
  cameraZones: ObjectZone[];
  cameraLines?: DetectionLine[];
  privacyZones?: PrivacyZone[];
  motionZones?: MotionZone[];
  alertZones?: AlertZone[];
  showLabels?: boolean;
}

export type ZoneKind = 'motion' | 'object' | 'alert';
