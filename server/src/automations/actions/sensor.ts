import { parseValue } from '../parseValue.js';

import type { ActionContext } from './types.js';

export async function actionSensor(ctx: ActionContext, data: Record<string, unknown>): Promise<void> {
  const camera = ctx.getCamera(data.cameraId as string);
  const sensors = camera.sensorController.getSensors();
  const sensor = sensors.find(
    (s) => String(s.type) === String(data.sensorType) && s.name === (data.sensorName as string) && s.pluginId === (data.sensorPluginId as string),
  );
  if (!sensor) throw new Error('Sensor not found');

  const serverSensor = camera.sensorController.getSensor(sensor.id, { activatedOnly: true });
  if (!serverSensor) throw new Error('Sensor not accessible');

  const properties = (data.properties as { property: string; value: string }[]) ?? [];
  for (const prop of properties) {
    const value = parseValue(ctx.resolve(prop.value));
    await serverSensor.updateValue(prop.property, value);
  }
}
