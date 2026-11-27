import { AirQualityProperty, BatteryProperty, ChargingState, sensorMeta, SensorType } from '@camera.ui/sdk';

import { formatMeasurement, sensorOffers, sensorPropertySpec, toneColor } from '@/common/sensorDisplay.js';

import { useSensorSettings } from '../useSensorSettings.js';
import { AIR_COLORS, AIR_LEVELS, COLD, LOW_BATTERY, MEASUREMENT_SCALES, scaleRatio, WARM, zoneColor } from './scales.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { TileScaleZone } from '../frame/types.js';
import type { MeasurementReading, MeasurementZoneView } from './types.js';

const SHOWN_CHARGING = new Set<string>([ChargingState.Charging, ChargingState.Full]);

export function useMeasurement(sensor: () => ReactiveSensor<object>) {
  const { t } = useI18n();
  const { propertyLabel } = useSensorSettings(sensor);

  const type = sensor().type;
  const semantics = sensorMeta(type)!.semantics!;
  const scale = MEASUREMENT_SCALES[type];
  const isAirQuality = type === SensorType.AirQuality;
  const isBattery = type === SensorType.Battery;

  const readings = computed<MeasurementReading[]>(() =>
    (semantics.readings ?? []).flatMap(({ property }) => {
      const value = numberOf(property);
      return value === undefined ? [] : [{ property, label: propertyLabel(property), text: format(value, property) }];
    }),
  );
  const readingProperty = computed(() => (isAirQuality ? readings.value[0]?.property : semantics.stateProperty));
  const value = computed(() => (readingProperty.value ? numberOf(readingProperty.value) : undefined));
  const text = computed(() => (value.value === undefined ? undefined : format(value.value, readingProperty.value!)));

  const level = computed(() => (isAirQuality ? AIR_LEVELS.indexOf(sensor().getProperty<string>(AirQualityProperty.Level) ?? '') : -1));
  const ratio = computed(() => {
    if (isAirQuality) return level.value < 0 ? undefined : (level.value + 0.5) / AIR_LEVELS.length;
    return scale && value.value !== undefined ? scaleRatio(value.value, scale) : undefined;
  });
  const zone = computed(() => (value.value === undefined ? undefined : scale?.zones?.find((entry) => value.value! <= entry.upTo)));

  const charging = computed(() => (isBattery && sensorOffers(sensor(), BatteryProperty.Charging) ? sensor().getProperty<string>(BatteryProperty.Charging) : undefined));
  const isCharging = computed(() => charging.value === ChargingState.Charging);
  const low = computed(() => {
    if (!isBattery) return false;
    if (sensorOffers(sensor(), BatteryProperty.Low)) return sensor().getProperty(BatteryProperty.Low) === true;
    return value.value !== undefined && value.value <= LOW_BATTERY;
  });

  const color = computed(() => {
    if (isAirQuality) return level.value < 0 ? undefined : AIR_COLORS[level.value];
    if (isBattery) return value.value === undefined ? undefined : toneColor(low.value ? 'alarm' : 'ok');
    if (type === SensorType.Temperature) return ratio.value === undefined ? undefined : `color-mix(in srgb, ${WARM} ${Math.round(ratio.value * 100)}%, ${COLD})`;
    return zone.value ? zoneColor(zone.value) : undefined;
  });

  const word = computed(() => {
    if (isAirQuality) return level.value < 0 ? undefined : t(`components.automation_nodes.${type}_state_${AIR_LEVELS[level.value]}`);
    if (charging.value && SHOWN_CHARGING.has(charging.value)) return t(`components.automation_nodes.${type}_state_${charging.value.toLowerCase()}`);
    if (low.value) return t('components.sensor_tile.battery_low');
    return zone.value?.word ? t(`components.sensor_tile.${zone.value.word}`) : undefined;
  });
  const caption = computed(() => (isAirQuality && readingProperty.value ? [propertyLabel(readingProperty.value), word.value].filter(Boolean).join(' · ') : word.value));
  const cardState = computed(() => (sensor().online.value ? (word.value ?? '--') : t('connection.offline')));
  const headline = computed(() => (sensor().online.value ? t(`components.camera_options.sensor_type_${type}`) : t('connection.offline')));

  const zoneViews = computed<MeasurementZoneView[] | undefined>(() => {
    if (!scale?.zones) return undefined;
    let from = 0;
    return scale.zones.map((entry) => {
      const to = scaleRatio(entry.upTo, scale);
      const view = { from, to, color: zoneColor(entry), label: entry.word && t(`components.sensor_tile.${entry.word}`), active: entry === zone.value };
      from = to;
      return view;
    });
  });
  const scaleZones = computed<TileScaleZone[] | undefined>(() => {
    if (isAirQuality) return AIR_COLORS.map((entry, index) => ({ to: (index + 1) / AIR_LEVELS.length, color: entry }));
    return zoneViews.value?.map(({ to, color: entry }) => ({ to, color: entry }));
  });
  const scaleGradient = computed<[string, string] | undefined>(() => (type === SensorType.Temperature ? [COLD, WARM] : undefined));

  function format(raw: number, property: string): string {
    return formatMeasurement(raw, sensorPropertySpec(sensor(), property), property === semantics.stateProperty ? scale?.decimals : undefined);
  }

  function numberOf(property: string): number | undefined {
    const raw = sensorOffers(sensor(), property) ? sensor().getProperty(property) : undefined;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
  }

  return {
    isAirQuality,
    readings,
    readingProperty,
    text,
    level,
    ratio,
    isCharging,
    color,
    word,
    caption,
    cardState,
    headline,
    scaleZones,
    scaleGradient,
    zoneViews,
    format,
  };
}
