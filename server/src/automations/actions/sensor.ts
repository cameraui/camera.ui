import { inject } from '../../container.js';
import { sensorPropertySpec } from '../../sensors/types.js';
import { parseValue } from '../parseValue.js';

import type { ActionContext } from './types.js';

export async function actionSensor(ctx: ActionContext, data: Record<string, unknown>): Promise<void> {
  const registry = inject('sensorRegistry');
  const sensor = registry.getSensor(data.sensorId as string, { connectedOnly: true });
  if (!sensor) throw new Error('Sensor not found');

  const properties = (data.properties as { property: string; value: string }[]) ?? [];
  for (const prop of properties) {
    const raw = ctx.resolve(prop.value);
    const value = sensorPropertySpec(sensor, prop.property)?.type === 'object' ? parseObject(prop.property, raw) : parseValue(raw);
    await sensor.updateValue(prop.property, value);
  }
}

function parseObject(property: string, raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`${property} needs a JSON object, got ${raw}`);
  }
}
