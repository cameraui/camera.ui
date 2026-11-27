import { SensorType } from '@camera.ui/sdk';

import { sensorIcon, sensorStatus, sensorToneColor, toneColor } from '@/common/sensorDisplay.js';

import { useSince } from './since.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { Component } from 'vue';

export interface HomeState {
  sensor: ReactiveSensor;
  name: string;
  active: boolean;
  offline: boolean;
  word: string;
  icon: Component;
  color: string;
  since?: number;
}

const STATE_PROPERTY = 'detected';

export function useStateGroup(sensors: () => ReactiveSensor[]) {
  const { t } = useI18n();

  const members = computed(() => sensors().filter((sensor) => sensor.type !== SensorType.Battery));
  const since = useSince(() => members.value, { property: () => STATE_PROPERTY });

  const items = computed<HomeState[]>(() => {
    const all = members.value.map((sensor) => {
      const offline = !sensor.online.value;
      const active = !offline && sensor.getProperty(STATE_PROPERTY) === true;
      return {
        sensor,
        name: sensor.displayName.value,
        active,
        offline,
        word: offline ? t('connection.offline') : sensorStatus(sensor.type, sensor, t),
        icon: sensorIcon(sensor.type, sensor),
        color: sensorToneColor(sensor.type, true) ?? toneColor('warn'),
        since: active ? since.get(sensor.id) : undefined,
      };
    });
    return [...all.filter((item) => item.active), ...all.filter((item) => !item.active)];
  });
  const active = computed(() => items.value.filter((item) => item.active));
  const offline = computed(() => items.value.every((item) => item.offline));
  const color = computed(() => active.value[0]?.color ?? toneColor('warn'));

  return { items, active, offline, color };
}
