import { getShortcutableTypes } from '@shared/types';

import { sensorHasPrimaryAction } from '@/components/CuiSensors/display.js';

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

const shortcutable = getShortcutableTypes();

export const SENSOR_SHORTCUTABLE_TYPES = new Set<SensorShortcutType>(shortcutable.map((type) => String(type) as SensorShortcutType));

export const SENSOR_READONLY_TYPES = new Set<SensorShortcutType>(
  shortcutable.filter((type) => !sensorHasPrimaryAction(type)).map((type) => String(type) as SensorShortcutType),
);
