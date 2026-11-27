import { fromUnitSystem, MediaPlayerState, PresenceProperty, SensorDomain, SensorType, ThermostatMode, toUnitSystem } from '@camera.ui/sdk';
import { toolDefinition } from '@tanstack/ai';
import * as zod from 'zod';

import { CamerasService } from '../../api/services/cameras.service.js';
import { SensorsService } from '../../api/services/sensors.service.js';
import { instanceUnitSystem } from '../../i18n/index.js';
import { SENSOR_TYPE_CONFIG, sensorPropertySpec } from '../../sensors/types.js';
import { resolveCameraName } from './cameras.js';
import { approvalSchema, toolError } from './shared.js';

import type { SensorSemantics } from '@camera.ui/sdk';
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
  if (semantics.domain === SensorDomain.Event) return (value as string) || 'idle';
  if (semantics.states) {
    const name = Object.entries(semantics.states).find(([, wire]) => wire === value)?.[0];
    const detail = detailOf(sensor, semantics);
    return name && detail ? `${name}, ${detail}` : (name ?? (value as number | undefined));
  }
  if (typeof value === 'boolean') {
    if (sensor.type === SensorType.Presence) return value ? 'home' : ['away', sensor.properties[PresenceProperty.Zone]].filter(Boolean).join(', ');
    if (semantics.deviceClass === 'opening' || sensor.type === SensorType.Contact) return value ? 'open' : 'closed';
    if (sensor.type === SensorType.Doorbell) return value ? 'ringing' : 'idle';
    if (sensor.type === SensorType.Scene) return value ? 'running' : 'idle';
    if (value && semantics.fan?.speed) return `on, ${String(sensor.properties[semantics.fan.speed])}% speed`;
    if (value && semantics.humidifier) return humidifierState(sensor, semantics.humidifier);
    return value ? 'on' : 'off';
  }
  if (typeof value === 'number' && semantics.unit) {
    const shown = toUnitSystem(value, semantics.unit, instanceUnitSystem());
    return `${shown.value} ${shown.unit}`;
  }
  return value as string | number | undefined;
}

function humidifierState(sensor: TransformedSensor, humidifier: NonNullable<SensorSemantics['humidifier']>): string {
  const current = humidifier.current ? sensor.properties[humidifier.current] : undefined;
  const parts = [
    humidifier.action ? sensor.properties[humidifier.action] : 'on',
    `target ${String(sensor.properties[humidifier.target])}%`,
    typeof current === 'number' ? `now ${current}%` : undefined,
  ];
  return parts.filter(Boolean).join(', ');
}

function mediaPlayerDetail(sensor: TransformedSensor, player: NonNullable<SensorSemantics['mediaPlayer']>): string | undefined {
  const text = (property: string | undefined) => {
    const value = property ? sensor.properties[property] : undefined;
    return typeof value === 'string' && value ? value : undefined;
  };
  const title = text(player.title);
  const volume = player.volume ? sensor.properties[player.volume] : undefined;
  const sound = player.muted && sensor.properties[player.muted] ? 'muted' : typeof volume === 'number' ? `volume ${volume}%` : undefined;
  return [title && [title, text(player.artist)].filter(Boolean).join(' by '), text(player.source), sound].filter(Boolean).join(', ') || undefined;
}

function detailOf(sensor: TransformedSensor, semantics: SensorSemantics): string | undefined {
  if (semantics.position) return `${String(sensor.properties[semantics.position.current])}% open`;
  if (semantics.mediaPlayer && sensor.properties[semantics.stateProperty] !== MediaPlayerState.Off) return mediaPlayerDetail(sensor, semantics.mediaPlayer);
  const climate = semantics.climate;
  if (!climate) return undefined;
  const temperature = (property: string) => {
    const value = sensor.properties[property];
    if (typeof value !== 'number') return undefined;
    const shown = toUnitSystem(value, '°C', instanceUnitSystem());
    return `${shown.value} ${shown.unit}`;
  };
  const { targetLow, targetHigh } = climate;
  const range = targetLow && targetHigh && sensor.properties[climate.mode] === ThermostatMode.HeatCool;
  const target = range ? `${temperature(targetLow)} to ${temperature(targetHigh)}` : temperature(climate.target);
  const action = climate.action ? sensor.properties[climate.action] : undefined;
  return [temperature(climate.current) && `${temperature(climate.current)} now`, action, target && `target ${target}`].filter(Boolean).join(', ');
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
  property: zod
    .string()
    .optional()
    .describe(
      // prettier-ignore
      'Property to set, default: the command property. Lights also take brightness, colorTemperature (kelvin) and color, ' +
      'covers and valves targetPosition (0 closed, 100 open), thermostats and water heaters targetTemperature, ' +
      'thermostats and humidifiers targetHumidity, fans and air purifiers speed (0 to 100), vacuums fanSpeed, ' +
      'media players on, volume (0 to 100), muted and source',
    ),
  value: zod.union([zod.boolean(), zod.number(), zod.string(), zod.record(zod.string(), zod.number())]).describe(
    // prettier-ignore
    'New value, for a light color an object with hue (0-360) and saturation (0-100), a temperature in the unit list_sensors shows, ' +
    'for a vacuum or lawn mower its command: start, pause, stop, dock, locate or spot, ' +
    'for a media player play, pause, stop, next or previous',
  ),
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

  const unit = sensorPropertySpec(found, target)?.unit;
  const stored = typeof value === 'number' && unit ? fromUnitSystem(value, unit, instanceUnitSystem()) : value;
  const result = await sensors.command(found.id, target, stored);
  if (typeof result === 'object') return toolError(`Sensor "${found.displayName || found.name}" rejected the value: ${result.rejected}.`);
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
