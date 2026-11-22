import { sensorMeta } from '@camera.ui/sdk';

import { SENSOR_PROPERTY_SPECS } from './types.js';

import type { PropertySpecOverride, SensorPropertySpec, SensorType } from '@camera.ui/sdk';

export function sanitizePropertySpecs(
  type: SensorType,
  overrides: Record<string, PropertySpecOverride>,
  warn: (message: string) => void,
): Record<string, PropertySpecOverride> {
  const typeSpecs = SENSOR_PROPERTY_SPECS[type] ?? {};
  const semantics = sensorMeta(type)?.semantics;
  const commandProperty = semantics?.commands ? semantics.commandProperty : undefined;
  const result: Record<string, PropertySpecOverride> = {};

  for (const [property, override] of Object.entries(overrides)) {
    const base = typeSpecs[property];
    if (!base) {
      warn(`${type} has no property "${property}", its spec is ignored`);
      continue;
    }
    const drop = (field: string) => warn(`${type}.${property}: "${field}" does not fit the type's spec, ignored`);
    const kept = sanitizeOverride(base, override, property === commandProperty, drop);
    if (Object.keys(kept).length > 0) result[property] = kept;
  }
  return result;
}

export function resolvePropertySpecs(type: SensorType, overrides: Record<string, PropertySpecOverride> | undefined): Record<string, SensorPropertySpec> {
  const typeSpecs = SENSOR_PROPERTY_SPECS[type] ?? {};
  const result: Record<string, SensorPropertySpec> = {};

  for (const [property, { values, ...rest }] of Object.entries(overrides ?? {})) {
    const base = typeSpecs[property];
    if (!base) continue;
    const narrowed = values && base.values ? Object.fromEntries(Object.entries(base.values).filter(([, value]) => values.includes(value))) : base.values;
    result[property] = { ...base, ...rest, ...(narrowed ? { values: narrowed } : {}) };
  }
  return result;
}

function sanitizeOverride(base: SensorPropertySpec, override: PropertySpecOverride, commands: boolean, drop: (field: string) => void): PropertySpecOverride {
  const kept: PropertySpecOverride = {};
  const numeric = base.type === 'number';

  if (override.min !== undefined) {
    if (numeric && isFiniteNumber(override.min) && override.min >= (base.min ?? -Infinity) && override.min <= (base.max ?? Infinity)) kept.min = override.min;
    else drop('min');
  }
  if (override.max !== undefined) {
    if (numeric && isFiniteNumber(override.max) && override.max <= (base.max ?? Infinity) && override.max >= (kept.min ?? base.min ?? -Infinity)) kept.max = override.max;
    else drop('max');
  }
  if (override.step !== undefined) {
    if (numeric && isFiniteNumber(override.step) && override.step > 0) kept.step = override.step;
    else drop('step');
  }
  if (override.unit !== undefined) {
    if (base.unit === undefined && typeof override.unit === 'string' && override.unit !== '') kept.unit = override.unit;
    else drop('unit');
  }
  if (override.values !== undefined) {
    const allowed = Object.values(base.values ?? {});
    // a device may take none of its type's commands, every other enum keeps at least one value
    const fits = Array.isArray(override.values) && (override.values.length > 0 || commands);
    if (base.type === 'enum' && fits && override.values.every((value) => allowed.includes(value))) {
      kept.values = [...new Set(override.values)];
    } else drop('values');
  }
  if (override.choices !== undefined) {
    const valid = (base.type === 'string' || numeric) && Array.isArray(override.choices) && override.choices.length > 0;
    if (valid && override.choices.every((choice) => typeof choice?.label === 'string' && typeof choice.value === (numeric ? 'number' : 'string'))) {
      kept.choices = override.choices.map(({ value, label }) => ({ value, label }));
    } else drop('choices');
  }
  if (override.maxLength !== undefined) {
    if (base.type === 'string' && Number.isInteger(override.maxLength) && override.maxLength > 0) kept.maxLength = override.maxLength;
    else drop('maxLength');
  }
  return kept;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
