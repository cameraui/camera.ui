import { LightColorMode } from '@camera.ui/sdk';

import type { LightColor } from '@camera.ui/sdk';

export interface CuiLightControlProps {
  on?: boolean;
  brightness?: number;
  hasBrightness?: boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  colorTemperature?: number;
  hasColorTemperature?: boolean;
  temperatureMin?: number;
  temperatureMax?: number;
  color?: LightColor;
  hasColor?: boolean;
  colorMode?: LightColorMode;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export interface CuiLightControlEmits {
  'update:on': [value: boolean];
  'update:brightness': [value: number];
  'update:colorTemperature': [value: number];
  'update:color': [value: LightColor];
}

export const CUI_LIGHT_CONTROL_DEFAULTS = {
  on: false,
  brightness: 100,
  hasBrightness: false,
  min: 0,
  max: 100,
  step: 1,
  unit: '%',
  colorTemperature: 2700,
  hasColorTemperature: false,
  temperatureMin: 2000,
  temperatureMax: 6500,
  hasColor: false,
  colorMode: LightColorMode.Temperature,
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiLightControlProps>;
