import { SENSOR_META } from '@camera.ui/sdk';

import type { SensorMeta, SensorPropertySpec, SensorSemantics, SensorType } from '@camera.ui/sdk';
import type { StoredSensorData } from '../rpc/interfaces/sensor.js';

type SemanticsInput = Pick<StoredSensorData, 'type' | 'capabilities'> & { propertySpecs?: Record<string, SensorPropertySpec> };

const META_BY_TYPE = new Map<SensorType, SensorMeta>((SENSOR_META as readonly SensorMeta[]).map((meta) => [meta.type, meta]));

export function resolveSensorSemantics(sensor: SemanticsInput): SensorSemantics | undefined {
  const meta = META_BY_TYPE.get(sensor.type);
  const base = meta?.semantics;
  if (!base) return undefined;

  const {
    brightness,
    volume,
    color,
    position,
    tilt,
    stop,
    climate,
    fan,
    humidifier,
    duration,
    readings,
    indicators,
    toggles,
    configuration,
    commands,
    fanSpeed,
    mediaPlayer,
    deviceClassProperty,
    ...rest
  } = base;
  const offered = (property: string) => isPropertyOffered(sensor, property);
  const kind = deviceClassProperty ? singleValue(sensor.propertySpecs?.[deviceClassProperty]) : undefined;
  // a narrowed kind wins, until then the type's own class stays
  const deviceClass = kind ?? base.deviceClass;
  const states = base.states ?? offeredValues(meta.properties[base.stateProperty]?.values, sensor.propertySpecs?.[base.stateProperty]);
  const offeredCommands = offeredValues(commands, sensor.propertySpecs?.[base.commandProperty]);
  const colors = color && offeredColor(color, offered);
  const fanParts = fan && offeredParts(fan, offered);
  const playerParts = mediaPlayer && offeredParts(mediaPlayer, offered);
  const offeredToggles = toggles?.filter(offered) ?? [];
  const offeredConfiguration = configuration?.filter(offered) ?? [];
  const offeredIndicators = indicators?.filter((indicator) => offered(indicator.property)) ?? [];
  // a humidifier carries its modes itself, a vacuum its fan speeds, a media player its sources
  const nativeChoices = new Set([base.commandProperty, humidifier?.mode, fanSpeed?.property, mediaPlayer?.source]);
  const choices = Object.entries(sensor.propertySpecs ?? {}).flatMap(([property, spec]) =>
    spec.writable && spec.choices?.length && !nativeChoices.has(property) && offered(property) ? [property] : [],
  );
  return {
    ...rest,
    ...(deviceClass ? { deviceClass } : {}),
    ...(states ? { states } : {}),
    ...(choices.length ? { choices } : {}),
    ...(offeredToggles.length ? { toggles: offeredToggles } : {}),
    ...(offeredConfiguration.length ? { configuration: offeredConfiguration } : {}),
    ...(offeredCommands ? { commands: offeredCommands } : {}),
    ...(fanSpeed && offered(fanSpeed.property) ? { fanSpeed } : {}),
    ...(brightness && offered(brightness.property) ? { brightness } : {}),
    ...(volume && offered(volume.property) ? { volume } : {}),
    ...(colors ? { color: colors } : {}),
    ...(position && offered(position.target) ? { position } : {}),
    ...(tilt && offered(tilt.target) ? { tilt } : {}),
    ...(stop && offered(stop.property) ? { stop } : {}),
    ...(climate ? { climate: offeredClimate(climate, offered) } : {}),
    ...(fanParts ? { fan: fanParts } : {}),
    ...(playerParts ? { mediaPlayer: playerParts } : {}),
    ...(humidifier ? { humidifier: offeredHumidifier(humidifier, offered) } : {}),
    ...(duration && offered(duration.property) ? { duration } : {}),
    ...(readings ? { readings: readings.filter((reading) => offered(reading.property)) } : {}),
    ...(offeredIndicators.length ? { indicators: offeredIndicators } : {}),
  };
}

function offeredColor(color: NonNullable<SensorSemantics['color']>, offered: (property: string) => boolean): SensorSemantics['color'] {
  const temperature = color.temperature && offered(color.temperature) ? color.temperature : undefined;
  const hueSaturation = color.hueSaturation && offered(color.hueSaturation) ? color.hueSaturation : undefined;
  if (!temperature && !hueSaturation) return undefined;
  // the mode only tells something when the light has both
  const mode = temperature && hueSaturation ? color.mode : undefined;
  return { ...(temperature ? { temperature } : {}), ...(hueSaturation ? { hueSaturation } : {}), ...(mode ? { mode } : {}) };
}

function offeredClimate(climate: NonNullable<SensorSemantics['climate']>, offered: (property: string) => boolean): SensorSemantics['climate'] {
  const { targetLow, targetHigh, action, humidity, targetHumidity, ...always } = climate;
  return {
    ...always,
    ...(targetLow && targetHigh && offered(targetLow) && offered(targetHigh) ? { targetLow, targetHigh } : {}),
    ...(action && offered(action) ? { action } : {}),
    ...(humidity && offered(humidity) ? { humidity } : {}),
    ...(targetHumidity && offered(targetHumidity) ? { targetHumidity } : {}),
  };
}

function offeredHumidifier(humidifier: NonNullable<SensorSemantics['humidifier']>, offered: (property: string) => boolean): SensorSemantics['humidifier'] {
  const { current, action, mode, target } = humidifier;
  return {
    target,
    ...(current && offered(current) ? { current } : {}),
    ...(action && offered(action) ? { action } : {}),
    ...(mode && offered(mode) ? { mode } : {}),
  };
}

function offeredParts<T extends object>(block: T, offered: (property: string) => boolean): Partial<T> | undefined {
  const parts = Object.entries(block).filter(([, property]) => typeof property === 'string' && offered(property));
  return parts.length ? (Object.fromEntries(parts) as Partial<T>) : undefined;
}

function isPropertyOffered(sensor: SemanticsInput, property: string): boolean {
  const capability = META_BY_TYPE.get(sensor.type)?.propertyCapabilities?.[property];
  return !capability || sensor.capabilities.includes(capability);
}

function singleValue(spec: SensorPropertySpec | undefined): string | undefined {
  const values = Object.values(spec?.values ?? {});
  return values.length === 1 ? String(values[0]) : undefined;
}

function offeredValues<T extends string | number>(
  values: Readonly<Record<string, T>> | undefined,
  narrowed: SensorPropertySpec | undefined,
): Record<string, T> | undefined {
  if (!values || !narrowed?.values) return values;
  const offered: unknown[] = Object.values(narrowed.values);
  return Object.fromEntries(Object.entries(values).filter(([, value]) => offered.includes(value)));
}
