export interface CuiOccupancySensorProps {
  detected?: boolean;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export const CUI_OCCUPANCY_SENSOR_DEFAULTS = {
  detected: false,
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiOccupancySensorProps>;
