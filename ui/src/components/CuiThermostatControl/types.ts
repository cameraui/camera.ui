import type { Component } from 'vue';

export interface ThermostatOption {
  label: string;
  value: string;
}

export interface CuiThermostatControlProps {
  icon: Component;
  iconStyle?: Record<string, string>;
  status?: string;
  targetTemperature?: number;
  targetTemperatureLow?: number;
  targetTemperatureHigh?: number;
  showTarget?: boolean;
  showRange?: boolean;
  min?: number;
  max?: number;
  step?: number;
  targetHumidity?: number;
  hasTargetHumidity?: boolean;
  humidityMin?: number;
  humidityMax?: number;
  humidityStep?: number;
  mode?: string;
  modes?: ThermostatOption[];
  preset?: string;
  presets?: ThermostatOption[];
  fanMode?: string;
  fanModes?: ThermostatOption[];
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export interface CuiThermostatControlEmits {
  'update:targetTemperature': [value: number];
  'update:targetTemperatureLow': [value: number];
  'update:targetTemperatureHigh': [value: number];
  'update:targetHumidity': [value: number];
  'update:mode': [value: string];
  'update:preset': [value: string];
  'update:fanMode': [value: string];
}

export const CUI_THERMOSTAT_CONTROL_DEFAULTS = {
  targetTemperature: 20,
  targetTemperatureLow: 18,
  targetTemperatureHigh: 24,
  showTarget: true,
  showRange: false,
  min: 7,
  max: 35,
  step: 0.5,
  targetHumidity: 50,
  hasTargetHumidity: false,
  humidityMin: 0,
  humidityMax: 100,
  humidityStep: 1,
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiThermostatControlProps>;
