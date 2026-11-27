import { BatteryProperty, LockProperty, LockState, SensorDomain, sensorMeta, SensorType } from '@camera.ui/sdk';
import CameraIcon from '~icons/bxs/cctv';
import NotesIcon from '~icons/mdi/bell-outline';
import ActionsIcon from '~icons/mdi/cctv';
import ClockIcon from '~icons/mdi/clock-outline';
import GroupIcon from '~icons/mdi/devices';
import FloorplanIcon from '~icons/mdi/floor-plan';
import EventsIcon from '~icons/mdi/history';
import LightsIcon from '~icons/mdi/lightbulb-group-outline';

import { isSensorActive, sensorTypeIcon } from '@/common/sensorDisplay.js';
import { BINARY_GROUPS } from '@/components/CuiSensorTile/binary/groups.js';
import { DETECTION_TYPES, HELPER_TYPES } from '@/components/CuiSensorTile/detection/groups.js';
import { LOW_BATTERY } from '@/components/CuiSensorTile/measurement/scales.js';
import { compareSensorTypes } from '@/components/CuiSensorTile/order.js';
import { hasSensorTile } from '@/components/CuiSensorTile/tiles.js';

import { HOME_SPECS } from './layout.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { DBAutomation, DBCamera, DBHomeWidget, DBHomeWidgetKind, DBRoomCatalog, TransformedSensor } from '@shared/types';
import type { HomeDockCategory, HomeNote, HomePageContent, HomeRoom, HomeWidgetSpec } from './types.js';

export const HOME_PAGE = 'home';

export const HOME_ICONS = {
  camera: CameraIcon,
  notes: NotesIcon,
  events: EventsIcon,
  lights: LightsIcon,
  automation: sensorTypeIcon(SensorType.Scene),
  floorplan: FloorplanIcon,
  group: GroupIcon,
  clock: ClockIcon,
  action: ActionsIcon,
};

export const DOCK_CATEGORIES: HomeDockCategory[] = [
  { key: 'light', types: [SensorType.Light] },
  { key: 'climate', types: [SensorType.Thermostat, SensorType.WaterHeater, SensorType.Fan, SensorType.AirPurifier, SensorType.Humidifier] },
  { key: 'security', types: [SensorType.SecuritySystem, SensorType.Siren] },
  { key: 'locks', types: [SensorType.Lock] },
  { key: 'openings', types: [SensorType.Contact, SensorType.Cover, SensorType.Garage] },
  { key: 'media', types: [SensorType.MediaPlayer] },
];

const OFF_HOME: readonly string[] = [...HELPER_TYPES, SensorType.PTZ, SensorType.Battery];

const CONTROL_DOMAINS = new Set<string>([
  SensorDomain.Light,
  SensorDomain.Switch,
  SensorDomain.Lock,
  SensorDomain.Siren,
  SensorDomain.Alarm,
  SensorDomain.Cover,
  SensorDomain.Climate,
  SensorDomain.WaterHeater,
  SensorDomain.Fan,
  SensorDomain.AirPurifier,
  SensorDomain.Humidifier,
  SensorDomain.Valve,
  SensorDomain.MediaPlayer,
  SensorDomain.Vacuum,
  SensorDomain.LawnMower,
]);

const OPENINGS = new Set<string>([SensorType.Contact, SensorType.Cover, SensorType.Garage]);

export function showsOnHome(sensor: TransformedSensor): boolean {
  if (!hasHomeTile(sensor)) return false;
  // a camera's detections stay with the camera, motion sensors of their own come home
  if (DETECTION_TYPES.includes(sensor.type) && !sensor.virtual && !sensor.origin) return false;
  return !sensor.device || sensor.primary || controls(sensor.type);
}

export function buildHomeRooms(catalog: DBRoomCatalog | undefined, cameras: DBCamera[], tiles: ReactiveSensor[], batteries: ReactiveSensor[]): HomeRoom[] {
  const levelOrder = new Map((catalog?.levels ?? []).map((level) => [level.id, level.order]));
  const levelRank = (levelId: string | null) => (levelId ? (levelOrder.get(levelId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER);

  return (catalog?.rooms ?? [])
    .filter((room) => room.name !== 'Default')
    .sort((a, b) => levelRank(a.levelId) - levelRank(b.levelId) || a.name.localeCompare(b.name))
    .map((room) => ({
      id: room.id,
      name: room.name,
      cameras: cameras.filter((camera) => camera.roomId === room.id),
      tiles: tiles.filter((sensor) => sensor.roomId.value === room.id),
      batteries: batteries.filter((sensor) => sensor.roomId.value === room.id),
    }));
}

export function homeWidget(kind: DBHomeWidgetKind, ref?: string): DBHomeWidget {
  return { id: ref ? `${kind}:${ref}` : kind, kind, ref };
}

export function autoWidgets(pageId: string, content: HomePageContent, rooms: HomeRoom[]): DBHomeWidget[] {
  const home = pageId === HOME_PAGE;
  const roomIds = new Set(rooms.map((room) => room.id));
  // the home page gathers what has no room page of its own
  const tiles = home ? content.tiles.filter((sensor) => !roomIds.has(sensor.roomId.value ?? '')) : content.tiles;

  return [
    ...(home ? [homeWidget('notes')] : []),
    ...(home && content.cameras.length ? [homeWidget('events')] : []),
    ...content.cameras.map((camera) => homeWidget('camera', camera._id)),
    ...[...tiles].sort(compareSensors).map((sensor) => homeWidget('sensor', sensor.id)),
  ];
}

export function tileSpec(type: string): HomeWidgetSpec {
  return controls(type) ? HOME_SPECS.mediumTile : HOME_SPECS.smallTile;
}

export function compareSensors(a: ReactiveSensor, b: ReactiveSensor): number {
  return compareSensorTypes(a.type, b.type) || a.displayName.value.localeCompare(b.displayName.value);
}

export function homeNotes(tiles: ReactiveSensor[], batteries: ReactiveSensor[]): HomeNote[] {
  const online = tiles.filter((sensor) => sensor.online.value);
  const notes: HomeNote[] = [
    { kind: 'alarm', sensors: online.filter(alarming) },
    { kind: 'open', sensors: online.filter(opened) },
    { kind: 'unlocked', sensors: online.filter(unlocked) },
    { kind: 'battery', sensors: batteries.filter(lowBattery) },
    { kind: 'offline', sensors: tiles.filter((sensor) => !sensor.online.value) },
  ];
  return notes.filter((note) => note.sensors.length);
}

export function opened(sensor: ReactiveSensor): boolean {
  return OPENINGS.has(sensor.type) && isSensorActive(sensor);
}

export function unlocked(sensor: ReactiveSensor): boolean {
  return sensor.type === SensorType.Lock && sensor.getProperty(LockProperty.CurrentState) === LockState.Unsecured;
}

export function runsByHand(automation: DBAutomation): boolean {
  return automation.nodes.some((node) => node.type === 'trigger-manual');
}

export function hasHomeTile(sensor: TransformedSensor): boolean {
  return hasSensorTile(sensor.type) && !OFF_HOME.includes(sensor.type) && !sensor.cameraBound && sensor.sourceState !== 'removed';
}

function controls(type: string): boolean {
  return CONTROL_DOMAINS.has(sensorMeta(type)?.semantics?.domain ?? '');
}

function alarming(sensor: ReactiveSensor): boolean {
  const group = BINARY_GROUPS[sensor.type];
  return (group === 'alarm' || group === 'leak') && isSensorActive(sensor);
}

function lowBattery(sensor: ReactiveSensor): boolean {
  const level = sensor.getProperty<number>(BatteryProperty.Level);
  return sensor.getProperty(BatteryProperty.Low) === true || (typeof level === 'number' && level < LOW_BATTERY);
}
