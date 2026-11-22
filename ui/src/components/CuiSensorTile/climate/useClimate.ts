import { sensorMeta, ThermostatAction, ThermostatMode, ThermostatProperty } from '@camera.ui/sdk';

import { decimalsOf, sensorOffers, sensorPropertySpec, toneColor } from '@/common/sensorDisplay.js';

import { sensorRange, snapToRange, toRatio } from '../range.js';
import { useLiveProperty } from '../useLiveProperty.js';
import { useSensorSettings } from '../useSensorSettings.js';
import { modeColor, OFF_MODE } from './modes.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { ClimateActivity, ClimateTargets } from './types.js';

const HEATING = new Set<string>([ThermostatAction.Heating, ThermostatAction.Preheating]);
const COOLING = new Set<string>([ThermostatAction.Cooling, ThermostatAction.Drying]);

export function useClimate(sensor: () => ReactiveSensor<object>) {
  const { t } = useI18n();

  const type = sensor().type;
  const names = sensorMeta(type)!.semantics!.climate!;
  const { toggles, flags, propertyLabel, choices, reading, send } = useSensorSettings(sensor);

  const target = useLiveProperty(sensor, names.target, 20);
  const low = names.targetLow ? useLiveProperty(sensor, names.targetLow, 18) : undefined;
  const high = names.targetHigh ? useLiveProperty(sensor, names.targetHigh, 24) : undefined;
  const humidityTarget = names.targetHumidity ? useLiveProperty(sensor, names.targetHumidity, 50) : undefined;

  const mode = computed(() => sensor().getProperty<string>(names.mode));
  const modes = computed(() => Object.values(sensorPropertySpec(sensor(), names.mode)?.values ?? {}).map(String));
  const isOff = computed(() => mode.value === OFF_MODE);
  const hasRange = computed(() => !!low && !!high && offers(names.targetLow) && mode.value === ThermostatMode.HeatCool);

  const activity = computed<ClimateActivity>(() => {
    if (isOff.value) return 'off';
    const action = offers(names.action) ? sensor().getProperty<string>(names.action!) : undefined;
    if (action && HEATING.has(action)) return 'heat';
    if (action && COOLING.has(action)) return 'cool';
    return 'idle';
  });
  const color = computed(() => {
    if (activity.value === 'heat') return toneColor('warn');
    if (activity.value === 'cool') return toneColor('info');
    return modeColor(mode.value);
  });

  const temperatureRange = computed(() => sensorRange(sensor(), names.target, 7, 35));
  const humidityRange = computed(() => sensorRange(sensor(), names.targetHumidity ?? names.target, 0, 100));

  const current = computed(() => reading(names.current));
  const humidity = computed(() => reading(names.humidity));
  const targets = computed<ClimateTargets>(() => ({
    target: target.value.value,
    low: low?.value.value ?? target.value.value,
    high: high?.value.value ?? target.value.value,
  }));
  const ratios = computed<ClimateTargets>(() => ({
    target: toRatio(targets.value.target, temperatureRange.value),
    low: toRatio(targets.value.low, temperatureRange.value),
    high: toRatio(targets.value.high, temperatureRange.value),
  }));
  const targetHumidity = computed(() => (humidityTarget && offers(names.targetHumidity) ? humidityTarget.value.value : undefined));

  const presets = computed(() => choices(ThermostatProperty.Preset));
  const preset = computed(() => sensor().getProperty<string>(ThermostatProperty.Preset));
  const fanModes = computed(() => choices(ThermostatProperty.FanMode));
  const fanMode = computed(() => sensor().getProperty<string>(ThermostatProperty.FanMode));

  const targetText = computed(() => {
    const step = temperatureRange.value.step;
    // a range stays short, it has to fit next to the icon of a small card
    if (hasRange.value) return `${rounded(targets.value.low, step)}–${rounded(targets.value.high, step)}°`;
    return degrees(targets.value.target, step);
  });
  const doing = computed(() => {
    if (isOff.value || !mode.value) return modeLabel(OFF_MODE);
    const step = temperatureRange.value.step;
    if (activity.value === 'heat') return t('components.sensor_tile.heating_to', { value: degrees(hasRange.value ? targets.value.low : targets.value.target, step) });
    if (activity.value === 'cool') return t('components.sensor_tile.cooling_to', { value: degrees(hasRange.value ? targets.value.high : targets.value.target, step) });
    if (hasRange.value) return t('components.sensor_tile.keeping', { value: targetText.value });
    return `${modeLabel(mode.value)} · ${targetText.value}`;
  });
  const stateText = computed(() => (sensor().connected.value ? [...flags.value, doing.value].join(' · ') : t('connection.offline')));

  let lastMode: string | undefined;

  watch(
    mode,
    (now) => {
      if (now && now !== OFF_MODE) lastMode = now;
    },
    { immediate: true },
  );

  function toggle() {
    const next = isOff.value ? (lastMode ?? defaultMode()) : OFF_MODE;
    if (next) setMode(next);
  }

  function nudge(from: ClimateTargets, delta: number, final: boolean) {
    const { min, max } = temperatureRange.value;
    if (hasRange.value && low && high) {
      const shift = Math.min(Math.max(delta, min - from.low), max - from.high);
      write(low, snap(from.low + shift), final);
      write(high, snap(from.high + shift), final);
      return;
    }
    write(target, snap(from.target + delta), final);
  }

  function setTarget(knob: keyof ClimateTargets, value: number, final: boolean) {
    const property = { target, low, high }[knob];
    const bounded = knob === 'low' ? Math.min(value, targets.value.high) : knob === 'high' ? Math.max(value, targets.value.low) : value;
    if (property) write(property, snap(bounded), final);
  }

  function setTargetHumidity(value: number, final: boolean) {
    if (humidityTarget) write(humidityTarget, value, final);
  }

  function setMode(value: string) {
    send(names.mode, value);
  }

  function modeLabel(value: string): string {
    return t(`components.automation_nodes.${type}_state_${value}`);
  }

  function degrees(value: number, step?: number): string {
    return `${value.toFixed(decimalsOf(step ?? 0.1))}°`;
  }

  function defaultMode(): string | undefined {
    return modes.value.includes(ThermostatMode.Heat) ? ThermostatMode.Heat : modes.value.find((value) => value !== OFF_MODE);
  }

  function snap(value: number): number {
    return Number(snapToRange(value, temperatureRange.value).toFixed(decimalsOf(temperatureRange.value.step)));
  }

  function offers(property: string | undefined): property is string {
    return !!property && sensorOffers(sensor(), property);
  }

  return {
    mode,
    modes,
    isOff,
    hasRange,
    activity,
    color,
    temperatureRange,
    humidityRange,
    current,
    humidity,
    targets,
    ratios,
    targetHumidity,
    presets,
    preset,
    fanModes,
    fanMode,
    toggles,
    targetText,
    stateText,
    toggle,
    nudge,
    setTarget,
    setTargetHumidity,
    setMode,
    send,
    modeLabel,
    propertyLabel,
    degrees,
  };
}

function write(property: ReturnType<typeof useLiveProperty<number>>, value: number, final: boolean) {
  if (final) property.commit(value);
  else property.input(value);
}

function rounded(value: number, step = 0.1): number {
  return Number(value.toFixed(decimalsOf(step)));
}
