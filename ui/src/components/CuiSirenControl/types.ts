export interface CuiSirenControlProps {
  active?: boolean;
  volume?: number;
  hasVolume?: boolean;
  tone?: string;
  tones?: { label: string; value: string }[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export interface CuiSirenControlEmits {
  'update:active': [value: boolean];
  'update:volume': [value: number];
  'update:tone': [value: string];
}

export const CUI_SIREN_CONTROL_DEFAULTS = {
  active: false,
  volume: 100,
  hasVolume: false,
  min: 0,
  max: 100,
  step: 1,
  unit: '%',
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiSirenControlProps>;
