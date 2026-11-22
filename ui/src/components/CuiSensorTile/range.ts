import { sensorPropertySpec } from '@/common/sensorDisplay.js';

import type { ReactiveSensor } from '@camera.ui/browser';

export interface ValueRange {
  min: number;
  max: number;
  step: number;
}

export function clampRatio(ratio: number): number {
  return Math.min(Math.max(ratio, 0), 1);
}

export function toRatio(value: number, { min, max }: ValueRange): number {
  return clampRatio((value - min) / (max - min || 1));
}

export function fromRatio(ratio: number, range: ValueRange): number {
  return snapToRange(range.min + clampRatio(ratio) * (range.max - range.min), range);
}

export function snapToRange(value: number, { min, max, step }: ValueRange): number {
  return Math.min(Math.max(Math.round(value / step) * step, min), max);
}

export function sensorRange(sensor: ReactiveSensor<object>, property: string, min: number, max: number): ValueRange {
  const spec = sensorPropertySpec(sensor, property);
  return { min: spec?.min ?? min, max: spec?.max ?? max, step: spec?.step ?? 1 };
}
