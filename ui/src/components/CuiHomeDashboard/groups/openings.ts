import { ContactProperty, GarageProperty, GarageState, LockProperty, LockState, SensorType } from '@camera.ui/sdk';
import DoorClosedIcon from '~icons/mdi/door-closed';
import DoorOpenIcon from '~icons/mdi/door-open';

import { sensorIcon } from '@/common/sensorDisplay.js';

import { useGroupSend } from './groupControl.js';
import { useSince } from './since.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { Component } from 'vue';

export interface HomeOpening {
  sensor: ReactiveSensor;
  open: boolean;
  since?: number;
  icon: Component;
}

const STATE_PROPERTIES: Partial<Record<string, string>> = {
  [SensorType.Contact]: ContactProperty.Detected,
  [SensorType.Garage]: GarageProperty.CurrentState,
  [SensorType.Lock]: LockProperty.CurrentState,
};

export function useOpeningGroup(sensors: () => ReactiveSensor[]) {
  const { send } = useGroupSend();

  const members = computed(() => sensors().filter((sensor) => STATE_PROPERTIES[sensor.type]));
  const since = useSince(() => members.value, {
    property: (sensor) => STATE_PROPERTIES[sensor.type]!,
    stateOf: (sensor, value) => isOpen(sensor.type, value),
    tracks: (open) => open === true,
  });
  const items = computed<HomeOpening[]>(() => {
    const all = members.value.map((sensor) => {
      const open = openNow(sensor);
      return { sensor, open, since: open ? since.get(sensor.id) : undefined, icon: openingIcon(sensor, open) };
    });
    return [...all.filter((item) => item.open), ...all.filter((item) => !item.open)];
  });
  const open = computed(() => items.value.filter((item) => item.open));
  const garages = computed(() => open.value.filter((item) => item.sensor.type === SensorType.Garage).map((item) => item.sensor));

  function closeGarages() {
    send(garages.value, (garage) => garage.setProperty(GarageProperty.TargetState, GarageState.Closed));
  }

  return { items, open, garages, closeGarages };
}

function openNow(sensor: ReactiveSensor): boolean {
  return sensor.online.value && isOpen(sensor.type, sensor.getProperty(STATE_PROPERTIES[sensor.type]!));
}

function isOpen(type: string, value: unknown): boolean {
  if (type === SensorType.Garage) return value !== undefined && value !== GarageState.Closed;
  if (type === SensorType.Lock) return value === LockState.Unsecured || value === LockState.Jammed;
  return value === true;
}

function openingIcon(sensor: ReactiveSensor, open: boolean): Component {
  // a lock stands for its door here
  if (sensor.type === SensorType.Lock) return open ? DoorOpenIcon : DoorClosedIcon;
  return sensorIcon(sensor.type, sensor);
}
