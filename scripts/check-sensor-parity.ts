import { readFileSync } from 'node:fs';

import { assignmentsSchema } from '../server/src/api/schemas/cameras.schema.js';
import {
  getDetectionTypes,
  getMultiProviderTypes,
  getSingleProviderTypes,
  getValidSensorTypes,
  SENSOR_PROPERTY_MAP,
  SENSOR_TYPE_CONFIG,
} from '../server/src/sensors/types.js';
import de from '../ui/src/i18n/locales/de.js';
import en from '../ui/src/i18n/locales/en.js';

const errors: string[] = [];

const PLUGIN_INFO = { id: 'parity', name: 'parity' };

function checkI18n(name: string, dict: typeof en): void {
  const typeKeys = (dict.components.camera_options ?? {}) as Record<string, string>;
  for (const type of getValidSensorTypes()) {
    if (!(`sensor_type_${type}` in typeKeys)) errors.push(`i18n ${name}: missing sensor_type_${type}`);
  }

  const propKeys = (dict.components.automation_nodes ?? {}) as Record<string, string>;
  const properties = new Set(Object.values(SENSOR_PROPERTY_MAP).flat());
  for (const property of properties) {
    if (!(`sensor_property_${property}` in propKeys)) errors.push(`i18n ${name}: missing sensor_property_${property}`);
  }
}

function checkAssignmentsSchema(): void {
  const single = new Set([...getSingleProviderTypes().map((type) => SENSOR_TYPE_CONFIG[type].assignmentKey), 'cameraController']);
  const multi = new Set([...getMultiProviderTypes().map((type) => SENSOR_TYPE_CONFIG[type].assignmentKey), 'hub']);
  const schemaKeys = new Set(Object.keys(assignmentsSchema.shape));

  for (const key of single) {
    if (!schemaKeys.has(key)) errors.push(`assignmentsSchema: missing single-provider key "${key}"`);
    else if (assignmentsSchema.safeParse({ [key]: PLUGIN_INFO }).success === false) errors.push(`assignmentsSchema: "${key}" should accept a single plugin`);
  }
  for (const key of multi) {
    if (!schemaKeys.has(key)) errors.push(`assignmentsSchema: missing multi-provider key "${key}"`);
    else if (assignmentsSchema.safeParse({ [key]: [PLUGIN_INFO] }).success === false) errors.push(`assignmentsSchema: "${key}" should accept a plugin array`);
  }
  for (const key of schemaKeys) {
    if (!single.has(key) && !multi.has(key)) errors.push(`assignmentsSchema: unexpected key "${key}" (not in the registry)`);
  }
}

function checkPythonDetectionTypes(): void {
  const source = readFileSync(new URL('../server/src/plugins/runtime/python/proxy/sensor.py', import.meta.url), 'utf8');
  const body = /DETECTION_SENSOR_TYPES[^=]*=\s*frozenset\(\s*\{([\s\S]*?)\}/.exec(source)?.[1];
  if (!body) {
    errors.push('python runtime: DETECTION_SENSOR_TYPES not found in proxy/sensor.py');
    return;
  }

  const byName = new Map(getValidSensorTypes().map((type) => [type.toLowerCase(), type]));
  const listed = new Set<string>();
  for (const [, name] of body.matchAll(/SensorType\.(\w+)/g)) {
    const type = byName.get(name.toLowerCase());
    if (type) listed.add(type);
    else errors.push(`python runtime: unknown sensor type "SensorType.${name}"`);
  }

  const expected = new Set<string>(getDetectionTypes());
  for (const type of expected) {
    if (!listed.has(type)) errors.push(`python runtime: DETECTION_SENSOR_TYPES is missing "${type}"`);
  }
  for (const type of listed) {
    if (!expected.has(type)) errors.push(`python runtime: DETECTION_SENSOR_TYPES has "${type}", which is not a detection type`);
  }
}

checkI18n('en', en);
checkI18n('de', de);
checkAssignmentsSchema();
checkPythonDetectionTypes();

if (errors.length > 0) {
  console.error('Sensor parity check failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('Sensor parity check passed.');
