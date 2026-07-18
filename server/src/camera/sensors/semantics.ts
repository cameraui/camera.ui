import { LightCapability, LightProperty, SENSOR_META, SensorType } from '@camera.ui/sdk';

import type { SensorMeta, SensorSemantics } from '@camera.ui/sdk';
import type { StoredSensorData } from '../../rpc/interfaces/sensor.js';

const SENSOR_SEMANTICS: Record<SensorType, SensorSemantics | null> = Object.fromEntries(
  (SENSOR_META as readonly SensorMeta[]).map((meta) => [meta.type, meta.semantics ?? null]),
) as Record<SensorType, SensorSemantics | null>;

export function resolveSensorSemantics(sensor: Pick<StoredSensorData, 'type' | 'capabilities'>): SensorSemantics | undefined {
  const base = SENSOR_SEMANTICS[sensor.type];
  if (!base) return undefined;

  if (sensor.type === SensorType.Light && sensor.capabilities.includes(LightCapability.Brightness)) {
    return { ...base, brightness: { property: LightProperty.Brightness, scale: 100 } };
  }

  return base;
}
