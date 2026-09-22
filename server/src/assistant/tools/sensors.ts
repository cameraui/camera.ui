import { SensorType } from '@camera.ui/sdk';
import { toolDefinition } from '@tanstack/ai';
import * as zod from 'zod';

import { CamerasService } from '../../api/services/cameras.service.js';
import { SensorsService } from '../../api/services/sensors.service.js';
import { SENSOR_TYPE_CONFIG } from '../../sensors/types.js';
import { resolveCameraName } from './cameras.js';
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

function stateOf(sensor: TransformedSensor): string | number | undefined {
  const semantics = sensor.semantics;
  if (!semantics) return undefined;
  const value = sensor.properties[semantics.stateProperty];
  if (semantics.states) return Object.entries(semantics.states).find(([, wire]) => wire === value)?.[0] ?? (value as number | undefined);
  if (typeof value === 'boolean') {
    if (semantics.deviceClass === 'opening' || sensor.type === SensorType.Contact) return value ? 'open' : 'closed';
    if (sensor.type === SensorType.Doorbell) return value ? 'ringing' : 'idle';
    return value ? 'on' : 'off';
  }
  if (typeof value === 'number' && semantics.unit) return `${value} ${semantics.unit}`;
  return value as string | number | undefined;
}

const listSensors = toolDefinition({
  name: 'list_sensors',
  description:
    'Sensors set up in camera.ui and their state right now: lights, switches, sirens, locks, doors, alarm systems, doorbells. ' +
    'Also which cameras detect something at this moment. Which sensors are on, is the door locked.',
  inputSchema: zod.object({
    camera: zod.string().optional().describe('Only the sensors of this one camera, omit it to get all sensors in one call'),
  }),
}).server<ToolContext['context']>(({ camera }) => {
  const resolved = camera ? resolveCameraName(camera) : undefined;
  if (camera && !resolved) return toolError(`No camera named "${camera}". Call list_cameras for the available names.`);

  const names = new Map(new CamerasService().list().map((entry) => [entry._id, entry.name]));
  const sensors = new SensorsService().list(resolved?.id);
  const devices = sensors
    .filter((sensor) => !SENSOR_TYPE_CONFIG[sensor.type]?.isDetectionType)
    .map((sensor) => ({
      name: sensor.displayName || sensor.name,
      type: sensor.type,
      state: stateOf(sensor),
      cameras: sensor.assignedCameraIds.map((id) => names.get(id)).filter((name) => name !== undefined),
      plugin: sensor.virtual ? 'virtual' : sensor.pluginName,
      ...(sensor.connected ? {} : { offline: true }),
    }));

  const detecting = new Map<string, Set<string>>();
  for (const sensor of sensors) {
    if (!SENSOR_TYPE_CONFIG[sensor.type]?.isDetectionType || sensor.properties.detected !== true) continue;
    for (const id of sensor.assignedCameraIds) {
      const cameraName = names.get(id);
      if (cameraName) detecting.set(cameraName, (detecting.get(cameraName) ?? new Set()).add(sensor.type));
    }
  }

  return {
    devices,
    detectingNow: Array.from(detecting, ([name, types]) => ({ camera: name, types: Array.from(types) })),
  };
});

const setSensorPropertyInput = zod.object({
  sensor: zod.string().describe('Sensor id or display name'),
  property: zod.string().optional().describe('Property to set, default: the command property'),
  value: zod.union([zod.boolean(), zod.number(), zod.string()]).describe('New value'),
});

const setSensorProperty = toolDefinition({
  name: 'set_sensor_property',
  lazy: true,
  description: 'Switch a sensor: turn a light, siren or switch on or off, set a value. Requires user confirmation.',
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

export const sensorTools: CoreTool[] = [listSensors, setSensorProperty];
