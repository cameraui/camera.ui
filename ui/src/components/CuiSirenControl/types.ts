export interface CuiSirenControlProps {
  active?: boolean;
  volume?: number;
  hasVolume?: boolean;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export interface CuiSirenControlEmits {
  'update:active': [value: boolean];
  'update:volume': [value: number];
}

export const CUI_SIREN_CONTROL_DEFAULTS = {
  active: false,
  volume: 100,
  hasVolume: false,
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiSirenControlProps>;
