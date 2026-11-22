import type { ReactiveSensor } from '@camera.ui/browser';

export type SensorTileSize = 'small' | 'medium' | 'large';

export interface CuiSensorTileProps {
  sensor: ReactiveSensor;
  size?: SensorTileSize;
  disabled?: boolean;
  expandInPlace?: boolean;
}

export interface CuiSensorTileSheetProps {
  sensor: ReactiveSensor;
  disabled?: boolean;
}

export interface SensorTileProps {
  sensor: ReactiveSensor;
  size: SensorTileSize;
  disabled?: boolean;
}

export interface SensorTileEmits {
  (e: 'expand', event: Event): void;
}

export interface TileOption {
  value: string;
  label: string;
}

export interface TileToggle {
  property: string;
  label: string;
  value: boolean;
}
