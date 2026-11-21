export interface CuiLightControlProps {
  on?: boolean;
  brightness?: number;
  hasBrightness?: boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export interface CuiLightControlEmits {
  'update:on': [value: boolean];
  'update:brightness': [value: number];
}

export const CUI_LIGHT_CONTROL_DEFAULTS = {
  on: false,
  brightness: 100,
  hasBrightness: false,
  min: 0,
  max: 100,
  step: 1,
  unit: '%',
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiLightControlProps>;
