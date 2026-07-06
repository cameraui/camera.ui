import type { DetectionLine, DetectionZone } from '@camera.ui/sdk';

export interface CuiPolygonProps {
  cameraZones: DetectionZone[];
  cameraLines?: DetectionLine[];
}
