import { PresenceProperty, SensorType } from '@camera.ui/sdk';

import { sensorStatus, sensorToneColor } from '@/common/sensorDisplay.js';
import { shortMoment } from '@/components/CuiSensorTile/useSensorHistory.js';

import { useSince } from './since.js';

import type { ReactiveSensor } from '@camera.ui/browser';

export interface HomePerson {
  sensor: ReactiveSensor;
  name: string;
  initial: string;
  home: boolean;
  offline: boolean;
  place: string;
  label: string;
  detail: string;
}

export interface CuiHomePersonProps {
  person: HomePerson;
  row?: boolean;
  size?: number;
  named?: boolean;
  placed?: boolean;
}

export function usePresenceGroup(sensors: () => ReactiveSensor[]) {
  const { t, locale } = useI18n();
  const now = useNow({ scheduler: (tick) => useIntervalFn(tick, 60_000) });

  const members = computed(() => sensors().filter((sensor) => sensor.type !== SensorType.Battery));
  const since = useSince(() => members.value, { property: () => PresenceProperty.Detected });

  const people = computed<HomePerson[]>(() =>
    members.value.map((sensor) => {
      const name = sensor.displayName.value;
      const offline = !sensor.online.value;
      const place = offline ? t('connection.offline') : sensorStatus(sensor.type, sensor, t);
      const time = since.get(sensor.id);
      return {
        sensor,
        name,
        initial: Array.from(name.trim())[0]?.toLocaleUpperCase(locale.value) ?? '?',
        home: !offline && sensor.getProperty(PresenceProperty.Detected) === true,
        offline,
        place,
        label: t('views.home_dashboard.groups.presence.member', { name, place }),
        detail:
          offline || time === undefined ? place : t('views.home_dashboard.groups.presence.since', { place, time: shortMoment(time, now.value.getTime(), locale.value) }),
      };
    }),
  );
  const home = computed(() => people.value.filter((person) => person.home));
  const away = computed(() => people.value.filter((person) => !person.home));
  const offline = computed(() => people.value.every((person) => person.offline));
  const color = sensorToneColor(SensorType.Presence, true);

  return { people, home, away, offline, color };
}
