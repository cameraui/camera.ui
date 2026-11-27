import { SensorType, SirenProperty } from '@camera.ui/sdk';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { sensorToneColor, toneColor } from '@/common/sensorDisplay.js';
import { BINARY_GROUPS } from '@/components/CuiSensorTile/binary/groups.js';

import { useGroupSend } from './groupControl.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { DBCamera } from '@shared/types';

export interface HomeAlarm {
  type: string;
  sensors: ReactiveSensor[];
}

const URGENCY: string[] = [
  SensorType.Smoke,
  SensorType.CarbonMonoxide,
  SensorType.Gas,
  SensorType.Heat,
  SensorType.GlassBreak,
  SensorType.Tamper,
  SensorType.Leak,
  SensorType.Cold,
  SensorType.Problem,
];

export function useSafetyGroup(sensors: () => ReactiveSensor[]) {
  const { data: cameraList } = new CamerasQuery().getCamerasQuery({ page: 1, pageSize: -1 });
  const { t } = useI18n();
  const { send } = useGroupSend();

  const detectors = computed(() => sensors().filter((sensor) => isDetector(sensor.type)));
  const hits = computed(() => detectors.value.filter((sensor) => sensor.online.value && sensor.getProperty('detected') === true).sort((a, b) => urgency(a) - urgency(b)));
  const alarms = computed(() => {
    const byType = new Map<string, ReactiveSensor[]>();
    for (const sensor of hits.value) byType.set(sensor.type, [...(byType.get(sensor.type) ?? []), sensor]);
    return [...byType].map(([type, members]): HomeAlarm => ({ type, sensors: members }));
  });
  const offline = computed(() => detectors.value.filter((sensor) => !sensor.online.value).length);
  const ordered = computed(() => [...hits.value, ...detectors.value.filter((sensor) => !hits.value.includes(sensor))]);
  const sirens = computed(() => sensors().filter((sensor) => sensor.type === SensorType.Siren));
  const sounding = computed(() => sirens.value.filter((siren) => siren.online.value && siren.getProperty(SirenProperty.Active) === true));
  const color = computed(() => (hits.value.length ? detectorColor(hits.value[0]) : toneColor('alarm')));
  const camera = computed(() => {
    for (const sensor of hits.value) {
      const found = cameraOf(sensor, cameraList.value?.result ?? []);
      if (found) return found;
    }
    return undefined;
  });
  const alarmText = computed(() =>
    alarms.value.map((alarm) => t('views.home_dashboard.groups.safety.alarm_line', { what: alarmWord(alarm.type), where: names(alarm.sensors) })).join(' · '),
  );

  function alarmWord(type: string): string {
    return t(`views.home_dashboard.groups.safety.alarm.${type}`);
  }

  function silence() {
    send(sounding.value, (siren) => siren.setProperty(SirenProperty.Active, false));
  }

  return { detectors, hits, alarms, offline, ordered, sirens, sounding, color, camera, alarmText, alarmWord, silence };
}

export function names(sensors: ReactiveSensor[]): string {
  return sensors.map((sensor) => sensor.displayName.value).join(', ');
}

export function detectorColor(sensor: ReactiveSensor): string {
  return sensorToneColor(sensor.type, true) ?? toneColor('warn');
}

function isDetector(type: string): boolean {
  const group = BINARY_GROUPS[type];
  return group === 'alarm' || group === 'leak';
}

function urgency(sensor: ReactiveSensor): number {
  const rank = URGENCY.indexOf(sensor.type);
  return rank < 0 ? URGENCY.length : rank;
}

function cameraOf(sensor: ReactiveSensor, cameras: DBCamera[]): DBCamera | undefined {
  const ids = [sensor.boundCameraId, ...sensor.assignedCameraIds.value].filter(Boolean);
  const own = ids.map((id) => cameras.find((camera) => camera._id === id)).find(Boolean);
  if (own) return own;
  const room = sensor.roomId.value;
  return room ? cameras.find((camera) => camera.roomId === room) : undefined;
}
