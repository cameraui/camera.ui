import { SensorDomain, SensorType, sensorMeta } from '@camera.ui/sdk';

import { sensorPropertySpec } from '@/common/sensorDisplay.js';

import type { ReactiveSensor } from '@camera.ui/browser';

export type SensorControlKind = SensorDomain | 'battery' | 'doorbell' | 'detection' | 'properties';

export interface SensorControlRange {
  min: number;
  max: number;
  step: number;
  unit?: string;
}

const DOMAIN_CONTROLS: ReadonlySet<string> = new Set([
  SensorDomain.Binary,
  SensorDomain.Measurement,
  SensorDomain.Switch,
  SensorDomain.Light,
  SensorDomain.Siren,
  SensorDomain.Lock,
  SensorDomain.Cover,
  SensorDomain.Climate,
  SensorDomain.Fan,
  SensorDomain.Valve,
  SensorDomain.Scene,
  SensorDomain.Humidifier,
  SensorDomain.AirPurifier,
  SensorDomain.WaterHeater,
  SensorDomain.Alarm,
  SensorDomain.Event,
]);

export function sensorControlKind(type: string): SensorControlKind | undefined {
  if (type === SensorType.Battery) return 'battery';
  if (type === SensorType.Doorbell) return 'doorbell';

  const meta = sensorMeta(type);
  if (!meta) return undefined;
  if (!meta.semantics) return meta.isDetectionType && 'detected' in meta.properties ? 'detection' : undefined;
  return DOMAIN_CONTROLS.has(meta.semantics.domain) ? meta.semantics.domain : 'properties';
}

export function hasSensorControlWidget(type: string): boolean {
  return sensorControlKind(type) !== undefined;
}

export function sensorControlRange(sensor: ReactiveSensor<object>, property: string): SensorControlRange {
  const spec = sensorPropertySpec(sensor, property);
  return { min: spec?.min ?? 0, max: spec?.max ?? 100, step: spec?.step ?? 1, unit: spec?.unit };
}
