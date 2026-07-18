import { SensorCategory } from '@camera.ui/sdk';
import { getShortcutableTypes, SENSOR_TYPE_CONFIG } from '@shared/types';

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
  shortcutable
    .filter((type) => [SensorCategory.Sensor, SensorCategory.Info].includes(SENSOR_TYPE_CONFIG[type].category))
    .map((type) => String(type) as SensorShortcutType),
);

export const INFO_SENSOR_TYPES = new Set<SensorShortcutType>(
  shortcutable
    .filter((type) => SENSOR_TYPE_CONFIG[type].category === SensorCategory.Info)
    .map((type) => String(type) as SensorShortcutType),
);
