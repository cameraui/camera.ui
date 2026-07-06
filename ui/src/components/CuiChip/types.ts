export interface CuiChipProps {
  value: string | number | object;
  removable?: boolean;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  filter?: boolean;
}
