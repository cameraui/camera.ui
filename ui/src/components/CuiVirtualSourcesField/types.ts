import { MediaPlayerCapability, SensorType } from '@camera.ui/sdk';

export interface CuiVirtualSourcesFieldProps {
  type: string;
  capabilities: string[];
}

export function offersSources(type: string, capabilities: string[]): boolean {
  return type === SensorType.MediaPlayer && capabilities.includes(MediaPlayerCapability.Source);
}
