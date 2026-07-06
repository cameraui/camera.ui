import { conditionIfElse } from './ifelse.js';
import { conditionSensorState } from './sensorState.js';
import { conditionSwitch } from './switch.js';
import { conditionTime } from './time.js';

import type { ConditionHandler } from './types.js';

export const CONDITION_HANDLERS: Record<string, ConditionHandler> = {
  'condition-ifelse': conditionIfElse,
  'condition-switch': conditionSwitch,
  'condition-sensorstate': conditionSensorState,
  'condition-time': conditionTime,
};

export const TRIGGER_TYPES = new Set([
  'trigger-detection',
  'trigger-sensor',
  'trigger-schedule',
  'trigger-webhook',
  'trigger-system',
  'trigger-manual',
  'trigger-geofence',
]);

export type { ConditionResult, ConditionHandler } from './types.js';
