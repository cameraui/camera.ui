import { AirQualityProperty, sensorMeta, SensorType } from '@camera.ui/sdk';

import { formatMeasurement, sensorOffers, sensorPropertySpec, sensorStatus, toneColor } from '@/common/sensorDisplay.js';
import { shownValue } from '@/common/units.js';
import { AIR_COLORS, AIR_LEVELS, MEASUREMENT_SCALES } from '@/components/CuiSensorTile/measurement/scales.js';
import { useRelativeTime } from '@/components/CuiSensorTile/useRelativeTime.js';

import { rangeText, temperatureText, useHomePlaces } from './places.js';

import type { Tone } from '@/common/sensorDisplay.js';
import type { ReactiveSensor } from '@camera.ui/browser';

export interface ReadingValue {
  sensor: ReactiveSensor;
  property: string;
  number?: number;
  format?: (raw: number) => string;
  text: string;
  short: string;
  caption: string;
  color?: string;
  issue?: string;
  severity: number;
}

export interface ReadingPlace {
  key: string;
  label: string;
  values: ReadingValue[];
  issue?: ReadingValue;
}

export interface CuiHomeReadingValueProps {
  value: ReadingValue;
  short?: boolean;
}

const PRESENCE_TYPES: readonly string[] = [SensorType.Motion, SensorType.Occupancy];
const VALUE_ORDER: readonly string[] = [SensorType.Temperature, SensorType.Humidity, SensorType.CarbonDioxide, SensorType.AirQuality];
const OUTLIER_TONES = new Set<Tone>(['warn', 'info', 'alarm']);
const AIR_ISSUES: Record<string, number> = { inferior: 1, poor: 2 };

export function useReadingsGroup(sensors: () => ReactiveSensor[], name: () => string) {
  const { t } = useI18n();
  const { timeAgo } = useRelativeTime();
  const homePlaces = useHomePlaces(sensors, name);

  const places = computed<ReadingPlace[]>(() =>
    homePlaces.value.flatMap((place) => {
      const values = place.sensors.flatMap((sensor) => valueOf(sensor) ?? []).sort((a, b) => rank(a.sensor.type) - rank(b.sensor.type));
      if (!values.length) return [];
      const issue = values.reduce<ReadingValue | undefined>((worst, value) => (value.severity > (worst?.severity ?? 0) ? value : worst), undefined);
      return [{ key: place.key, label: place.label, values, issue }];
    }),
  );

  const single = computed(() => places.value.length <= 1);
  const values = computed(() => places.value[0]?.values ?? []);
  const offline = computed(() => sensors().every((sensor) => sensor.type === SensorType.Battery || !sensor.online.value));

  const worst = computed(() =>
    places.value.reduce<ReadingPlace | undefined>((found, place) => ((place.issue?.severity ?? 0) > (found?.issue?.severity ?? 0) ? place : found), undefined),
  );
  const alerting = computed(() => !!worst.value?.issue);
  const color = computed(() => worst.value?.issue?.color ?? toneColor('warn'));
  const temperatures = computed(() => numbersOf(SensorType.Temperature));
  const humidities = computed(() => numbersOf(SensorType.Humidity));
  const temperatureRange = computed(() => rangeText(temperatures.value, '°'));
  const humidityRange = computed(() => rangeText(humidities.value, ' %'));

  const presence = computed(() => {
    const sensor = sensors().find((member) => PRESENCE_TYPES.includes(member.type) && member.online.value);
    if (!sensor) return undefined;
    if (sensor.type !== SensorType.Motion) return sensorStatus(sensor.type, sensor, t);
    if (sensor.getProperty('detected') === true) return t('views.home_dashboard.groups.readings.motion');
    const last = sensor.getProperty<number>('lastTriggered');
    return last ? t('views.home_dashboard.groups.readings.motion_ago', { time: timeAgo(last) }) : undefined;
  });

  const count = computed(() => t('views.home_dashboard.groups.readings.rooms', { count: places.value.length }, places.value.length));
  const alert = computed(() => worst.value?.issue?.issue);
  const line = computed(() => {
    if (offline.value) return t('connection.offline');
    if (single.value) return presence.value ?? alert.value;
    return alert.value ? t('views.home_dashboard.groups.readings.issue', { place: worst.value!.label, issue: alert.value }) : count.value;
  });
  const narrowLine = computed(() => (offline.value || single.value || alert.value ? line.value : [count.value, humidityRange.value].filter(Boolean).join(' · ')));
  const summary = computed(() => {
    if (offline.value) return t('connection.offline');
    if (single.value) return presence.value ?? alert.value;
    return alert.value ?? count.value;
  });

  function valueOf(sensor: ReactiveSensor): ReadingValue | undefined {
    if (!sensor.online.value || PRESENCE_TYPES.includes(sensor.type)) return undefined;
    return sensor.type === SensorType.AirQuality ? airValue(sensor) : measuredValue(sensor);
  }

  function measuredValue(sensor: ReactiveSensor): ReadingValue | undefined {
    const property = sensorMeta(sensor.type)?.semantics?.stateProperty;
    const raw = property && sensorOffers(sensor, property) ? sensor.getProperty(property) : undefined;
    if (!property || typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
    const spec = sensorPropertySpec(sensor, property);
    const scale = MEASUREMENT_SCALES[sensor.type];
    const zone = scale?.zones?.find((entry) => raw <= entry.upTo);
    const tone = zone?.tone && OUTLIER_TONES.has(zone.tone) ? zone.tone : undefined;
    const airing = tone && sensor.type === SensorType.CarbonDioxide ? zone?.word : undefined;
    const format = (value: number) =>
      sensor.type === SensorType.Temperature ? temperatureText(shownValue(value, spec?.unit).value) : formatMeasurement(value, spec, scale?.decimals);
    const shown = shownValue(raw, spec?.unit);
    const text = format(raw);
    const unit = sensor.type !== SensorType.Temperature && shown.unit && !/^[%°]/.test(shown.unit) ? shown.unit : undefined;
    return {
      sensor,
      property,
      number: shown.value,
      format,
      text,
      short: unit ? text.slice(0, -unit.length).trimEnd() : text,
      caption: unit ? `${typeLabel(sensor.type)} ${unit}` : typeLabel(sensor.type),
      color: tone && toneColor(tone),
      issue: airing && t(`views.home_dashboard.groups.readings.${airing}`),
      severity: airing ? (tone === 'alarm' ? 2 : 1) : 0,
    };
  }

  function airValue(sensor: ReactiveSensor): ReadingValue | undefined {
    const level = sensor.getProperty<string>(AirQualityProperty.Level);
    const index = AIR_LEVELS.indexOf(level ?? '');
    if (index < 0) return undefined;
    const severity = AIR_ISSUES[level!] ?? 0;
    const text = t(`components.automation_nodes.${SensorType.AirQuality}_state_${level}`);
    return {
      sensor,
      property: AirQualityProperty.Level,
      text,
      short: text,
      caption: typeLabel(sensor.type),
      color: severity ? AIR_COLORS[index] : undefined,
      issue: severity ? t(`views.home_dashboard.groups.readings.air_${level}`) : undefined,
      severity,
    };
  }

  function typeLabel(type: string): string {
    return t(`components.camera_options.sensor_type_${type}`);
  }

  function numbersOf(type: string): number[] {
    return places.value.flatMap((place) => place.values.find((value) => value.sensor.type === type)?.number ?? []);
  }

  return { places, single, values, offline, alerting, color, temperatureRange, humidityRange, line, narrowLine, summary };
}

function rank(type: string): number {
  const index = VALUE_ORDER.indexOf(type);
  return index < 0 ? VALUE_ORDER.length : index;
}
