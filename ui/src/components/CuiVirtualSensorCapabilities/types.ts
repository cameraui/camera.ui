import type { SensorPropertySpec } from '@camera.ui/sdk';
import type { VirtualSensorType } from '@shared/types';

export interface CuiVirtualSensorCapabilitiesProps {
  sensorId: string;
  type: VirtualSensorType;
  capabilities: string[];
  propertySpecs: Record<string, SensorPropertySpec>;
}
