import { fromUnitSystem, toUnitSystem, UnitSystem } from '@camera.ui/sdk';

import type { UnitValue } from '@camera.ui/sdk';

export const unitSystem = ref(UnitSystem.Metric);

export function shownValue(value: number, unit: string | undefined): UnitValue {
  return unit ? toUnitSystem(value, unit, unitSystem.value) : { value, unit: '' };
}

export function storedValue(value: number, unit: string | undefined): number {
  return unit ? fromUnitSystem(value, unit, unitSystem.value) : value;
}

export function shownStep(step: number, unit: string | undefined): number {
  // a step is a difference, it converts without the offset of the unit
  return round(shownValue(step, unit).value - shownValue(0, unit).value);
}

export function shownRange({ min, max, step }: { min: number; max: number; step: number }, unit: string | undefined) {
  if (!unit || shownValue(0, unit).unit === unit) return { min, max, step };
  const shown = roundStep(shownStep(step, unit));
  return {
    min: round(Math.ceil(shownValue(min, unit).value / shown - 1e-9) * shown),
    max: round(Math.floor(shownValue(max, unit).value / shown + 1e-9) * shown),
    step: shown,
  };
}

function roundStep(step: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(step));
  const factor = [1, 2, 5, 10].reduce((best, next) => (Math.abs(step / magnitude - next) < Math.abs(step / magnitude - best) ? next : best));
  return round(factor * magnitude);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
