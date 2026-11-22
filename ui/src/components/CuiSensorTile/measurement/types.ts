import type { ReactiveSensor } from '@camera.ui/browser';
import type { Tone } from '@/common/sensorDisplay.js';

export interface MeasurementZone {
  upTo: number;
  tone?: Tone;
  word?: string;
}

export interface MeasurementScale {
  min: number;
  max: number;
  decimals: number;
  log?: boolean;
  zones?: MeasurementZone[];
}

export interface MeasurementZoneView {
  from: number;
  to: number;
  color: string;
  label?: string;
  active: boolean;
}

export interface MeasurementReading {
  property: string;
  label: string;
  text: string;
}

export interface CuiRatioSceneProps {
  ratio: number;
}

export interface CuiDropSceneProps {
  ratio: number;
  zones: MeasurementZoneView[];
}

export interface CuiSunSceneProps {
  ratio: number;
  dark: boolean;
}

export interface CuiCo2SceneProps {
  poor: boolean;
}

export interface CuiAirQualitySceneProps {
  level: number;
  colors: string[];
}

export interface CuiBatterySceneProps {
  ratio: number;
  charging: boolean;
}

export interface CuiMeasurementTrendProps {
  sensor: ReactiveSensor;
  property: string;
  format: (value: number) => string;
}
