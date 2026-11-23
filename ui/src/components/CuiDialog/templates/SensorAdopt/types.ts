import type { DiscoveredSensorListItem } from '@shared/types';

export interface SensorAdoptProps {
  items: DiscoveredSensorListItem[];
  name: string;
  pluginName: string;
  device?: boolean;
  cameraOptions: { label: string; value: string }[];
}
