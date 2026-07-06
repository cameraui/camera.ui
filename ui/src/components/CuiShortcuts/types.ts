import type { ReactiveSensor } from '@camera.ui/browser';
import type { DBSensorShortcut, SensorShortcutType } from '@shared/types';

export interface CuiShortcutsProps {
  cameraName: string;
  visible?: boolean;
  editing?: boolean;
  interactionLocked?: boolean;
}

export interface ResolvedSensorShortcut {
  shortcut: DBSensorShortcut;
  sensor: ReactiveSensor | undefined;
  isOnline: boolean;
}

export const SENSOR_READONLY_TYPES = new Set<SensorShortcutType>(['contact', 'temperature', 'humidity', 'occupancy', 'smoke', 'leak', 'battery']);

export const INFO_SENSOR_TYPES = new Set<SensorShortcutType>(['temperature', 'humidity', 'battery']);
