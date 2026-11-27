import { HumidityProperty, sensorMeta, SensorType, TemperatureProperty, ThermostatAction, ThermostatMode, ThermostatProperty } from '@camera.ui/sdk';

import { sensorOffers, sensorPropertySpec } from '@/common/sensorDisplay.js';
import { shownValue } from '@/common/units.js';
import { modeIcon, OFF_MODE } from '@/components/CuiSensorTile/climate/modes.js';

import { useGroupSend } from './groupControl.js';
import { rangeText, temperatureText, useHomePlaces, withoutPrefix } from './places.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { SensorClimate } from '@camera.ui/sdk';
import type { Component } from 'vue';
import type { HomePlace } from './places.js';

export type ClimateGroupMode = 'heat' | 'eco' | 'off';

export interface ClimateModeOption {
  value: ClimateGroupMode;
  label: string;
  icon: Component;
}

export interface ClimateRoom {
  key: string;
  label: string;
  sensor: ReactiveSensor;
  current?: number;
  value: string;
  detail: string;
  humidity?: string;
  heating: boolean;
  description: string;
}

export interface CuiHomeClimateModesProps {
  options: ClimateModeOption[];
  selected?: ClimateGroupMode;
  icons: boolean;
  disabled: boolean;
}

export interface CuiHomeClimateModesEmits {
  (e: 'select', mode: ClimateGroupMode): void;
}

export interface CuiHomeClimateRoomProps {
  room: ClimateRoom;
  big?: boolean;
}

const HEATING = new Set<string>([ThermostatAction.Heating, ThermostatAction.Preheating]);
// without a reported action, a room this far below its target counts as heating
const HEAT_MARGIN = 0.2;
const ECO = 'eco';
// leaving eco takes the device's plain preset, and devices name it differently
const PLAIN_PRESETS = ['none', 'comfort', 'home', 'manual'];
const HOLD_MS = 2000;

export function useClimateGroup(sensors: () => ReactiveSensor[], name: () => string) {
  const { t } = useI18n();
  const { send } = useGroupSend();
  const places = useHomePlaces(sensors, name);

  const preview = shallowRef<ClimateGroupMode>();
  let release: ReturnType<typeof setTimeout> | undefined;

  const thermostats = computed(() => sensors().filter((sensor) => sensor.type === SensorType.Thermostat));
  const online = computed(() => thermostats.value.filter((sensor) => sensor.online.value));
  const offline = computed(() => !online.value.length);
  const allOff = computed(() => !offline.value && online.value.every(isOff));
  const hasEco = computed(() => online.value.length > 0 && online.value.every((sensor) => ecoPreset(sensor) !== undefined));

  const options = computed<ClimateModeOption[]>(() => [
    { value: 'heat', label: t('components.automation_nodes.thermostat_state_heat'), icon: modeIcon(ThermostatMode.Heat) },
    ...(hasEco.value ? [{ value: 'eco' as const, label: t('views.home_dashboard.groups.climate.eco'), icon: modeIcon(ECO) }] : []),
    { value: 'off', label: t('components.automation_nodes.thermostat_state_off'), icon: modeIcon(ThermostatMode.Off) },
  ]);

  const reported = computed<ClimateGroupMode | undefined>(() => {
    const list = online.value;
    if (!list.length || list.some(isOff)) return allOff.value ? 'off' : undefined;
    if (list.every(isEco)) return 'eco';
    return list.every((sensor) => modeOf(sensor) === ThermostatMode.Heat && !isEco(sensor)) ? 'heat' : undefined;
  });
  const mode = computed(() => preview.value ?? reported.value);

  const rooms = computed(() => places.value.flatMap(roomsOf));
  const heatingCount = computed(() => rooms.value.filter((room) => room.heating).length);
  const range = computed(
    () =>
      rangeText(
        rooms.value.flatMap((room) => (room.current === undefined ? [] : [room.current])),
        '°',
      ) ?? '–',
  );

  const stateText = computed(() => {
    if (offline.value) return t('connection.offline');
    if (allOff.value) return t('components.automation_nodes.thermostat_state_off');
    const state = heatingCount.value
      ? t('views.home_dashboard.groups.climate.heating', { count: heatingCount.value, total: thermostats.value.length })
      : t('views.home_dashboard.groups.climate.settled');
    return mode.value === 'eco' ? `${t('views.home_dashboard.groups.climate.eco')} · ${state}` : state;
  });
  const summary = computed(() => {
    if (offline.value) return t('connection.offline');
    if (allOff.value) return t('components.automation_nodes.thermostat_state_off');
    return heatingCount.value
      ? t('views.home_dashboard.groups.climate.heating_short', { count: heatingCount.value })
      : t('views.home_dashboard.groups.climate.settled_short');
  });

  onBeforeUnmount(() => clearTimeout(release));

  function setMode(next: ClimateGroupMode) {
    preview.value = next;
    clearTimeout(release);
    release = setTimeout(() => (preview.value = undefined), HOLD_MS);
    send(online.value, (sensor) => apply(sensor, next));
  }

  function roomsOf(place: HomePlace): ClimateRoom[] {
    const temperature = readingOf(place.sensors, SensorType.Temperature, TemperatureProperty.Current);
    const humidity = readingOf(place.sensors, SensorType.Humidity, HumidityProperty.Current);
    const devices = place.sensors.filter((sensor) => climateOf(sensor) !== undefined);
    const readings = devices.some((sensor) => sensor.type === SensorType.Thermostat) ? undefined : place.sensors.find((sensor) => !climateOf(sensor));
    const rooms = devices.map((device) =>
      deviceRoom(device, readings || devices.length > 1 ? withoutPrefix(device.displayName.value, name()) : place.label, temperature, humidity),
    );
    if (!readings) return rooms;

    const detail = humidity === undefined ? '' : humidityText(humidity);
    const value = temperature === undefined ? '–' : temperatureText(temperature);
    return [
      { key: place.key, label: place.label, sensor: readings, current: temperature, value, detail, heating: false, description: describe(place.label, value, detail) },
      ...rooms,
    ];
  }

  function deviceRoom(device: ReactiveSensor, label: string, temperature: number | undefined, humidity: number | undefined): ClimateRoom {
    const thermostat = device.type === SensorType.Thermostat;
    const current = (thermostat ? temperature : undefined) ?? reading(device, climateOf(device)!.current);
    const heating = thermostat && heats(device);
    const own = thermostat ? (reading(device, ThermostatProperty.CurrentHumidity) ?? humidity) : undefined;
    const value = current === undefined ? '–' : temperatureText(current);
    const detail = detailOf(device, heating);
    return {
      key: device.id,
      label,
      sensor: device,
      current: thermostat ? current : undefined,
      value,
      detail,
      humidity: own === undefined ? undefined : humidityText(own),
      heating,
      description: describe(label, value, heating && detail ? t('components.sensor_tile.heating_to', { value: detail }) : detail),
    };
  }

  function detailOf(device: ReactiveSensor, heating: boolean): string {
    if (!device.online.value) return t('connection.offline');
    if (isOff(device)) return t('components.automation_nodes.thermostat_state_off');
    const target = targetText(device);
    if (!target) return '';
    return heating ? target : t('views.home_dashboard.groups.climate.target', { value: target });
  }

  function describe(label: string, value: string, detail: string): string {
    return [label, value, detail].filter(Boolean).join(', ');
  }

  async function apply(sensor: ReactiveSensor, next: ClimateGroupMode) {
    if (next === 'off') {
      if (!isOff(sensor)) await sensor.setProperty(ThermostatProperty.Mode, OFF_MODE);
      return;
    }
    const on = heatMode(sensor);
    if (on && modeOf(sensor) !== on && (next === 'heat' || isOff(sensor))) await sensor.setProperty(ThermostatProperty.Mode, on);
    const preset = next === 'eco' ? ecoPreset(sensor) : isEco(sensor) ? plainPreset(sensor) : undefined;
    if (preset !== undefined) await sensor.setProperty(ThermostatProperty.Preset, preset);
  }

  return { options, mode, rooms, heatingCount, range, offline, stateText, summary, setMode };
}

function readingOf(sensors: ReactiveSensor[], type: SensorType, property: string): number | undefined {
  for (const sensor of sensors) {
    const value = sensor.type === type ? reading(sensor, property) : undefined;
    if (value !== undefined) return value;
  }
  return undefined;
}

function reading(sensor: ReactiveSensor, property: string): number | undefined {
  const raw = sensor.online.value && sensorOffers(sensor, property) ? sensor.getProperty(property) : undefined;
  return typeof raw === 'number' && Number.isFinite(raw) ? shownValue(raw, sensorPropertySpec(sensor, property)?.unit).value : undefined;
}

function climateOf(sensor: ReactiveSensor): SensorClimate | undefined {
  return sensorMeta(sensor.type)?.semantics?.climate;
}

function targetText(sensor: ReactiveSensor): string | undefined {
  const names = climateOf(sensor)!;
  if (modeOf(sensor) === ThermostatMode.HeatCool && names.targetLow && names.targetHigh && sensorOffers(sensor, names.targetLow)) {
    const low = reading(sensor, names.targetLow);
    const high = reading(sensor, names.targetHigh);
    return low === undefined || high === undefined ? undefined : `${trimmed(low)}–${degrees(high)}`;
  }
  const target = reading(sensor, names.target);
  return target === undefined ? undefined : degrees(target);
}

function heats(sensor: ReactiveSensor): boolean {
  if (!sensor.online.value || isOff(sensor)) return false;
  if (sensorOffers(sensor, ThermostatProperty.Action)) return HEATING.has(String(sensor.getProperty(ThermostatProperty.Action)));
  const mode = modeOf(sensor);
  if (mode !== ThermostatMode.Heat && mode !== ThermostatMode.Auto) return false;
  const current = reading(sensor, ThermostatProperty.CurrentTemperature);
  const target = reading(sensor, ThermostatProperty.TargetTemperature);
  return current !== undefined && target !== undefined && current < target - HEAT_MARGIN;
}

function modeOf(sensor: ReactiveSensor): string | undefined {
  const names = climateOf(sensor);
  return names && sensor.getProperty<string>(names.mode);
}

function isOff(sensor: ReactiveSensor): boolean {
  return modeOf(sensor) === OFF_MODE;
}

function heatMode(sensor: ReactiveSensor): string | undefined {
  const modes = Object.values(sensorPropertySpec(sensor, ThermostatProperty.Mode)?.values ?? {}).map(String);
  if (!modes.length || modes.includes(ThermostatMode.Heat)) return ThermostatMode.Heat;
  return modes.find((mode) => mode !== OFF_MODE);
}

function presets(sensor: ReactiveSensor): (string | number)[] {
  if (!sensorOffers(sensor, ThermostatProperty.Preset)) return [];
  return (sensorPropertySpec(sensor, ThermostatProperty.Preset)?.choices ?? []).map((choice) => choice.value);
}

function ecoPreset(sensor: ReactiveSensor): string | number | undefined {
  return presets(sensor).find((value) => String(value).toLowerCase() === ECO);
}

function plainPreset(sensor: ReactiveSensor): string | number | undefined {
  return presets(sensor).find((value) => PLAIN_PRESETS.includes(String(value).toLowerCase()));
}

function isEco(sensor: ReactiveSensor): boolean {
  const eco = ecoPreset(sensor);
  return eco !== undefined && sensor.getProperty(ThermostatProperty.Preset) === eco;
}

function trimmed(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function degrees(value: number): string {
  return `${trimmed(value)}°`;
}

function humidityText(value: number): string {
  return `${Math.round(value)} %`;
}
