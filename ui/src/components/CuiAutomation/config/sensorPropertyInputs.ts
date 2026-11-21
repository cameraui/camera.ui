import { getSensorPropertySpec } from '@shared/types';

import { shownValue } from '@/common/units.js';

import type { SensorPropertySpec } from '@camera.ui/sdk';

export type SensorPropertyInputKind = 'boolean' | 'number' | 'enum' | 'choice' | 'text';

type SensorPropertySpecs = Readonly<Record<string, SensorPropertySpec>>;

export interface SensorPropertyEnumOption {
  labelKey: string;
  value: string;
}

export interface SensorPropertyChoiceOption {
  label: string;
  value: string;
}

export interface SensorPropertyInputMeta {
  kind: SensorPropertyInputKind;
  min?: number;
  max?: number;
  step?: number;
  // the unit the value is stored in, min, max and suffix are already in the shown unit
  unit?: string;
  suffix?: string;
  maxLength?: number;
  options?: SensorPropertyEnumOption[];
  choices?: SensorPropertyChoiceOption[];
}

export function getSensorPropertyInput(sensorType: string, property: string, sensorSpecs?: SensorPropertySpecs): SensorPropertyInputMeta {
  const spec = sensorSpecs?.[property] ?? getSensorPropertySpec(sensorType, property);
  if (!spec) return { kind: 'text' };
  if (spec.choices) return { kind: 'choice', choices: spec.choices.map(({ label, value }) => ({ label, value: String(value) })) };

  switch (spec.type) {
    case 'boolean':
      return { kind: 'boolean' };
    case 'number':
      return {
        kind: 'number',
        ...(spec.min !== undefined ? { min: shownValue(spec.min, spec.unit).value } : {}),
        ...(spec.max !== undefined ? { max: shownValue(spec.max, spec.unit).value } : {}),
        ...(spec.step !== undefined ? { step: spec.step } : {}),
        ...(spec.unit ? { unit: spec.unit, suffix: ` ${shownValue(0, spec.unit).unit}` } : {}),
      };
    case 'enum':
      return {
        kind: 'enum',
        options: Object.entries(spec.values ?? {}).map(([name, value]) => ({
          labelKey: `${sensorType}_state_${name}`,
          value: String(value),
        })),
      };
    default:
      return { kind: 'text', ...(spec.maxLength !== undefined ? { maxLength: spec.maxLength } : {}) };
  }
}

export function getSensorPropertyDefaultValue(sensorType: string, property: string, sensorSpecs?: SensorPropertySpecs): string {
  const meta = getSensorPropertyInput(sensorType, property, sensorSpecs);
  if (meta.kind === 'boolean') return 'true';
  if (meta.kind === 'enum') return meta.options?.[0]?.value ?? '';
  if (meta.kind === 'choice') return meta.choices?.[0]?.value ?? '';
  return '';
}
