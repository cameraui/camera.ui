import type { Component } from 'vue';

export interface HumidifierOption {
  label: string;
  value: string;
}

export interface CuiHumidifierControlProps {
  icon: Component;
  iconStyle?: Record<string, string>;
  status?: string;
  on?: boolean;
  targetHumidity?: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  mode?: string;
  modes?: HumidifierOption[];
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export interface CuiHumidifierControlEmits {
  'update:on': [value: boolean];
  'update:targetHumidity': [value: number];
  'update:mode': [value: string];
}

export const CUI_HUMIDIFIER_CONTROL_DEFAULTS = {
  on: false,
  targetHumidity: 50,
  min: 0,
  max: 100,
  step: 1,
  unit: '%',
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiHumidifierControlProps>;
