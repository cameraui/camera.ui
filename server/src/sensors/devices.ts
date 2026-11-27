import { SensorCategory, SensorType } from '@camera.ui/sdk';

import { SENSOR_TYPE_CONFIG } from './types.js';

import type { DeviceInfo, SensorDevice } from '@camera.ui/sdk';
import type { SensorDeviceState } from '@camera.ui/sdk/internal';
import type { DBSensor, DBSensorDevice } from '../api/database/types.js';

export function composeDeviceState(record: DBSensor, device: DBSensorDevice | undefined, primaryId: string | undefined): SensorDeviceState {
  const ownName = record.displayName ?? record.name;
  if (!device) return { displayName: ownName, shortName: ownName, primary: false };

  const deviceName = device.displayName ?? device.name;
  const shortName = stripDevicePrefix(ownName, device);
  const primary = primaryId === record._id;
  return {
    device: toSensorDevice(device),
    displayName: primary ? deviceName : `${deviceName} ${shortName}`,
    shortName,
    primary,
  };
}

export function pickPrimary(members: DBSensor[]): DBSensor | undefined {
  const marked = members.filter((member) => member.primary);
  if (!marked.length) return members.length === 1 ? members[0] : undefined;
  return marked.sort((a, b) => typeRank(a.type) - typeRank(b.type) || a.createdAt - b.createdAt || a._id.localeCompare(b._id))[0];
}

export function sanitizeDeviceInfo(info: DeviceInfo): DeviceInfo {
  return {
    id: String(info.id),
    name: deviceText(info.name) ?? '',
    manufacturer: deviceText(info.manufacturer),
    model: deviceText(info.model),
    firmware: deviceText(info.firmware),
    serialNumber: deviceText(info.serialNumber),
  };
}

export function toSensorDevice(device: DBSensorDevice): SensorDevice {
  return {
    id: device._id,
    name: device.displayName ?? device.name,
    manufacturer: device.manufacturer,
    model: device.model,
    firmware: device.firmware,
    serialNumber: device.serialNumber,
  };
}

function deviceText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return typeof value === 'number' ? String(value) : undefined;
}

function stripDevicePrefix(name: string, device: DBSensorDevice): string {
  // names from before the grouping still carry the device name ("Hallway sensor Temperature")
  for (const prefix of [device.displayName, device.name]) {
    if (!prefix || !name.toLowerCase().startsWith(`${prefix.toLowerCase()} `)) continue;
    const rest = name.slice(prefix.length + 1).trim();
    if (rest) return rest;
  }
  return name;
}

function typeRank(type: SensorType): number {
  if (type === SensorType.Battery) return 3;
  switch (SENSOR_TYPE_CONFIG[type].category) {
    case SensorCategory.Control:
      return 1;
    case SensorCategory.Info:
      return 2;
    default:
      return 0;
  }
}
