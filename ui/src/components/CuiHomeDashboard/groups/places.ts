import { SensorType } from '@camera.ui/sdk';

import { RoomsQuery } from '@/api/routes/rooms.js';
import { SensorsQuery } from '@/api/routes/sensors.js';

import type { ReactiveSensor } from '@camera.ui/browser';

export interface HomePlace {
  key: string;
  label: string;
  sensors: ReactiveSensor[];
}

export interface CuiHomeValueCellProps {
  name: string;
  value: string;
  big?: boolean;
}

export function useHomePlaces(sensors: () => ReactiveSensor[], groupName: () => string) {
  const { data: sensorList } = new SensorsQuery().getSensorsQuery();
  const { data: catalog } = new RoomsQuery().getRoomsQuery();

  const devices = computed(() => new Map((sensorList.value ?? []).flatMap((sensor) => (sensor.device ? [[sensor.id, sensor.device] as const] : []))));
  const roomNames = computed(() => new Map((catalog.value?.rooms ?? []).map((room) => [room.id, room.name])));

  return computed<HomePlace[]>(() => {
    const members = sensors().filter((sensor) => sensor.type !== SensorType.Battery);
    const deviceRooms = new Map<string, string>();
    for (const sensor of members) {
      const device = devices.value.get(sensor.id);
      if (device && sensor.roomId.value) deviceRooms.set(device.id, sensor.roomId.value);
    }

    const places = new Map<string, HomePlace>();
    for (const sensor of members) {
      const device = devices.value.get(sensor.id);
      const roomId = sensor.roomId.value ?? (device && deviceRooms.get(device.id));
      const key = roomId ? `room:${roomId}` : device ? `device:${device.id}` : sensor.id;
      const place = places.get(key);
      if (place) place.sensors.push(sensor);
      else {
        const label = (roomId && roomNames.value.get(roomId)) || device?.name || sensor.displayName.value;
        places.set(key, { key, label: withoutPrefix(label, groupName()), sensors: [sensor] });
      }
    }
    return [...places.values()];
  });
}

export function withoutPrefix(label: string, prefix: string): string {
  return label.length > prefix.length + 1 && label.startsWith(`${prefix} `) ? label.slice(prefix.length + 1) : label;
}

export function temperatureText(value: number): string {
  return `${value.toFixed(1)}°`;
}

export function rangeText(values: number[], unit: string): string | undefined {
  if (!values.length) return undefined;
  const low = Math.round(Math.min(...values));
  const high = Math.round(Math.max(...values));
  return low === high ? `${low}${unit}` : `${low}–${high}${unit}`;
}
