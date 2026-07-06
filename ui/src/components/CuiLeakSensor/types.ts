export interface CuiLeakSensorProps {
  detected?: boolean;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export const CUI_LEAK_SENSOR_DEFAULTS = {
  detected: false,
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiLeakSensorProps>;
