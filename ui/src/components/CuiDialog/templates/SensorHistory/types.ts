import type { SensorPropertySpec } from '@camera.ui/sdk';

export type HistoryRange = 'day' | 'week' | 'all';

export interface SensorHistoryProps {
  sensorId: string;
  sensorType: string;
  propertySpecs?: Record<string, SensorPropertySpec>;
}

export interface SensorHistoryTarget {
  id: string;
  name: string;
  type: string;
  propertySpecs?: Record<string, SensorPropertySpec>;
}
