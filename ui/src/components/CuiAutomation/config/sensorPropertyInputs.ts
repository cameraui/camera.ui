import { getSensorPropertySpec } from '@shared/types';

export type SensorPropertyInputKind = 'boolean' | 'number' | 'enum' | 'text';

export interface SensorPropertyEnumOption {
  labelKey: string;
  value: string;
}

export interface SensorPropertyInputMeta {
  kind: SensorPropertyInputKind;
  min?: number;
  max?: number;
  options?: SensorPropertyEnumOption[];
}

export function getSensorPropertyInput(sensorType: string, property: string): SensorPropertyInputMeta {
  const spec = getSensorPropertySpec(sensorType, property);
  if (!spec) return { kind: 'text' };

  switch (spec.type) {
    case 'boolean':
      return { kind: 'boolean' };
    case 'number':
      return {
        kind: 'number',
        ...(spec.min !== undefined ? { min: spec.min } : {}),
        ...(spec.max !== undefined ? { max: spec.max } : {}),
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
      return { kind: 'text' };
  }
}

// Initial value when a property gets enabled — booleans default to the
// "do something" state, enums to their first option.
export function getSensorPropertyDefaultValue(sensorType: string, property: string): string {
  const meta = getSensorPropertyInput(sensorType, property);
  if (meta.kind === 'boolean') return 'true';
  if (meta.kind === 'enum') return meta.options?.[0]?.value ?? '';
  return '';
}
