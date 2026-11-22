import { AirQualityLevel, SensorType } from '@camera.ui/sdk';

import { toneColor } from '@/common/sensorDisplay.js';

import type { MeasurementScale, MeasurementZone } from './types.js';

export const COLD = toneColor('info');
export const WARM = toneColor('warn');
export const NEUTRAL = 'var(--text-secondary-color)';
export const LOW_BATTERY = 20;

export const AIR_LEVELS: string[] = [AirQualityLevel.Excellent, AirQualityLevel.Good, AirQualityLevel.Fair, AirQualityLevel.Inferior, AirQualityLevel.Poor];
export const AIR_COLORS = [toneColor('ok'), `color-mix(in srgb, ${toneColor('ok')}, ${toneColor('light')})`, toneColor('light'), toneColor('warn'), toneColor('alarm')];

export const MEASUREMENT_SCALES: Partial<Record<string, MeasurementScale>> = {
  [SensorType.Temperature]: { min: -10, max: 40, decimals: 1 },
  [SensorType.Humidity]: {
    min: 0,
    max: 100,
    decimals: 0,
    zones: [
      { upTo: 30, tone: 'warn', word: 'dry' },
      { upTo: 60, tone: 'ok', word: 'comfortable' },
      { upTo: Infinity, tone: 'info', word: 'humid' },
    ],
  },
  [SensorType.Illuminance]: {
    min: 0,
    max: 100_000,
    decimals: 0,
    log: true,
    zones: [
      { upTo: 10, word: 'dark' },
      { upTo: 200, tone: 'light', word: 'dim' },
      { upTo: Infinity, tone: 'light', word: 'bright' },
    ],
  },
  [SensorType.CarbonDioxide]: {
    min: 400,
    max: 2000,
    decimals: 0,
    zones: [
      { upTo: 800, tone: 'ok', word: 'co2_good' },
      { upTo: 1200, tone: 'warn', word: 'co2_fair' },
      { upTo: Infinity, tone: 'alarm', word: 'co2_poor' },
    ],
  },
  [SensorType.Battery]: {
    min: 0,
    max: 100,
    decimals: 0,
    zones: [
      { upTo: LOW_BATTERY, tone: 'alarm' },
      { upTo: Infinity, tone: 'ok' },
    ],
  },
};

export function scaleRatio(value: number, { min, max, log }: MeasurementScale): number {
  const ratio = log ? Math.log10(Math.max(value, 0) + 1) / Math.log10(max + 1) : (value - min) / (max - min);
  return Math.min(Math.max(ratio, 0), 1);
}

export function zoneColor(zone: MeasurementZone | undefined): string {
  return zone?.tone ? toneColor(zone.tone) : NEUTRAL;
}
