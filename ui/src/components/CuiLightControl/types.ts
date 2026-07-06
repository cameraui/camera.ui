export interface CuiLightControlProps {
  on?: boolean;
  brightness?: number;
  hasBrightness?: boolean;
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
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiLightControlProps>;
