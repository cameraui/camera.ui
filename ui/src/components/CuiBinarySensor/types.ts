import type { SensorType } from '@camera.ui/sdk';

export interface CuiBinarySensorProps {
  type: SensorType;
  detected?: boolean;
  status?: string;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export const CUI_BINARY_SENSOR_DEFAULTS = {
  detected: false,
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiBinarySensorProps>;
