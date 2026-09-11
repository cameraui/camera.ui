import { toolDefinition } from '@tanstack/ai';
import * as zod from 'zod';

import { SensorsService } from '../../api/services/sensors.service.js';
import { approvalSchema, toolError } from './shared.js';

import type { TransformedSensor } from '../../api/services/sensors.service.js';
import type { CoreTool, ToolContext } from './shared.js';

function findSensor(sensors: SensorsService, idOrName: string): TransformedSensor | undefined {
  const byId = sensors.getById(idOrName);
  if (byId) return byId;
  const needle = idOrName.trim().toLowerCase();
  const all = sensors.list();
  return all.find((s) => (s.displayName || s.name).toLowerCase() === needle) ?? all.find((s) => (s.displayName || s.name).toLowerCase().includes(needle));
}

const setSensorPropertyInput = zod.object({
  sensor: zod.string().describe('Sensor id or display name'),
  property: zod.string().optional().describe('Property to set, defaults to the command property of the sensor'),
  value: zod.union([zod.boolean(), zod.number(), zod.string()]).describe('New value'),
});

const setSensorProperty = toolDefinition({
  name: 'set_sensor_property',
  lazy: true,
  description:
    'Change a writable sensor: switch a light or siren, arm a virtual switch, set a value. ' +
    'Read the sensor first to learn its command property. Requires user confirmation.',
  needsApproval: true,
  inputSchema: approvalSchema(setSensorPropertyInput),
  metadata: { adminOnly: true },
}).server<ToolContext['context']>(async (args) => {
  const parsed = setSensorPropertyInput.safeParse(args);
  if (!parsed.success) return toolError(`Invalid arguments: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
  const { sensor, property, value } = parsed.data;
  const sensors = new SensorsService();
  const found = findSensor(sensors, sensor);
  if (!found) return toolError(`No sensor "${sensor}".`);

  const target = property ?? found.semantics?.commandProperty;
  if (!target) return toolError(`Sensor "${found.displayName || found.name}" has no command property, pass one explicitly.`);

  const result = await sensors.command(found.id, target, value);
  switch (result) {
    case 'ok':
      return { ok: true, sensor: found.displayName || found.name, property: target, value };
    case 'read-only':
      return toolError(`Sensor "${found.displayName || found.name}" is read-only.`);
    case 'disconnected':
      return toolError(`Sensor "${found.displayName || found.name}" is disconnected.`);
    default:
      return toolError('Sensor vanished while setting it.');
  }
});

export const sensorTools: CoreTool[] = [setSensorProperty];
