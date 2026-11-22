import { getShortcutableTypes } from '@shared/types';

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
