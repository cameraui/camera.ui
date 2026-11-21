import { fromUnitSystem, toUnitSystem, UnitSystem } from '@camera.ui/sdk';

import type { UnitValue } from '@camera.ui/sdk';

export const unitSystem = ref(UnitSystem.Metric);

export function shownValue(value: number, unit: string | undefined): UnitValue {
  return unit ? toUnitSystem(value, unit, unitSystem.value) : { value, unit: '' };
}

export function storedValue(value: number, unit: string | undefined): number {
  return unit ? fromUnitSystem(value, unit, unitSystem.value) : value;
}
