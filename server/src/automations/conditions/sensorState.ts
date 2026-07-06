import { isEqual } from '@camera.ui/sdk/internal';

import { parseValue } from '../parseValue.js';

import type { ActionContext } from '../actions/types.js';
import type { ConditionResult } from './types.js';

export async function conditionSensorState(ctx: ActionContext, data: Record<string, unknown>): Promise<ConditionResult> {
  const camera = ctx.getCamera(data.cameraId as string);
  const sensors = camera.sensorController.getSensors();
  const sensor = sensors.find(
    (s) => String(s.type) === String(data.sensorType) && s.name === (data.sensorName as string) && s.pluginId === (data.sensorPluginId as string),
  );
  if (!sensor) return { handle: 'false' };

  const conditions = (data.conditions as { property: string; expectedValue: string }[]) ?? [];
  if (conditions.length === 0) return { handle: 'true' };

  const logic = (data.logic as string) ?? 'AND';

  const results = conditions.map((cond) => {
    const value = camera.sensorController.getPropertyValue(sensor.id, cond.property);
    const expected = parseValue(ctx.resolve(cond.expectedValue));
    return isEqual(value, expected);
  });

  const result = logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
  return { handle: result ? 'true' : 'false' };
}
