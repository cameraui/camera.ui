export interface CuiContactSensorProps {
  detected?: boolean;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export const CUI_CONTACT_SENSOR_DEFAULTS = {
  detected: false,
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiContactSensorProps>;
