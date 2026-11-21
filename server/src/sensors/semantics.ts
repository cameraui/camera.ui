import { SENSOR_META } from '@camera.ui/sdk';

import type { SensorMeta, SensorPropertySpec, SensorSemantics, SensorType } from '@camera.ui/sdk';
import type { StoredSensorData } from '../rpc/interfaces/sensor.js';

type SemanticsInput = Pick<StoredSensorData, 'type' | 'capabilities'> & { propertySpecs?: Record<string, SensorPropertySpec> };

const META_BY_TYPE = new Map<SensorType, SensorMeta>((SENSOR_META as readonly SensorMeta[]).map((meta) => [meta.type, meta]));

export function resolveSensorSemantics(sensor: SemanticsInput): SensorSemantics | undefined {
  const meta = META_BY_TYPE.get(sensor.type);
  const base = meta?.semantics;
  if (!base) return undefined;

  const { brightness, volume, readings, deviceClassProperty, ...rest } = base;
  const offered = (property: string) => isPropertyOffered(sensor, property);
  const deviceClass = deviceClassProperty ? singleValue(sensor.propertySpecs?.[deviceClassProperty]) : base.deviceClass;
  const states = base.states ?? offeredValues(meta.properties[base.stateProperty], sensor.propertySpecs?.[base.stateProperty]);
  const choices = Object.entries(sensor.propertySpecs ?? {}).flatMap(([property, spec]) =>
    spec.writable && spec.choices?.length && property !== base.commandProperty && offered(property) ? [property] : [],
  );
  return {
    ...rest,
    ...(deviceClass ? { deviceClass } : {}),
    ...(states ? { states } : {}),
    ...(choices.length ? { choices } : {}),
    ...(brightness && offered(brightness.property) ? { brightness } : {}),
    ...(volume && offered(volume.property) ? { volume } : {}),
    ...(readings ? { readings: readings.filter((reading) => offered(reading.property)) } : {}),
  };
}

function isPropertyOffered(sensor: SemanticsInput, property: string): boolean {
  const capability = META_BY_TYPE.get(sensor.type)?.propertyCapabilities?.[property];
  return !capability || sensor.capabilities.includes(capability);
}

function singleValue(spec: SensorPropertySpec | undefined): string | undefined {
  const values = Object.values(spec?.values ?? {});
  return values.length === 1 ? String(values[0]) : undefined;
}

function offeredValues(spec: SensorPropertySpec | undefined, narrowed: SensorPropertySpec | undefined): Record<string, string | number> | undefined {
  if (!spec?.values || !narrowed?.values) return spec?.values;
  const offered = Object.values(narrowed.values);
  return Object.fromEntries(Object.entries(spec.values).filter(([, value]) => offered.includes(value)));
}
