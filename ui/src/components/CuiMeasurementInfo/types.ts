import type { SensorType } from '@camera.ui/sdk';

export interface CuiMeasurementInfoProps {
  type: SensorType;
  value?: string;
  details?: string;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export const CUI_MEASUREMENT_INFO_DEFAULTS = {
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiMeasurementInfoProps>;
