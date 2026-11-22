import { sensorMeta } from '@camera.ui/sdk';

import type { SensorPropertySpec } from '@camera.ui/sdk';

export interface CuiVirtualKindFieldProps {
  type: string;
}

export function sensorKinds(type: string): string[] {
  const meta = sensorMeta(type);
  const property = meta?.semantics?.deviceClassProperty;
  return property ? Object.values(meta.properties[property]?.values ?? {}).map(String) : [];
}

export function pickedKind(type: string, propertySpecs: Record<string, SensorPropertySpec>): string | undefined {
  const property = sensorMeta(type)?.semantics?.deviceClassProperty;
  const values = Object.values((property && propertySpecs[property]?.values) || {});
  return values.length === 1 ? String(values[0]) : undefined;
}
