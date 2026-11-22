import { SensorType } from '@camera.ui/sdk';

import type { BinaryGroup } from './types.js';

export const BINARY_GROUPS: Partial<Record<string, BinaryGroup>> = {
  [SensorType.Smoke]: 'alarm',
  [SensorType.Gas]: 'alarm',
  [SensorType.CarbonMonoxide]: 'alarm',
  [SensorType.Heat]: 'alarm',
  [SensorType.Cold]: 'alarm',
  [SensorType.GlassBreak]: 'alarm',
  [SensorType.Tamper]: 'alarm',
  [SensorType.Problem]: 'alarm',
  [SensorType.Leak]: 'leak',
  [SensorType.Contact]: 'contact',
  [SensorType.Presence]: 'presence',
  [SensorType.Occupancy]: 'presence',
  [SensorType.Power]: 'power',
  [SensorType.Vibration]: 'vibration',
};
