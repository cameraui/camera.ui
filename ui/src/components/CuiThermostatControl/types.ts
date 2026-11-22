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
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiThermostatControlProps>;
