export interface CuiSwitchControlProps {
  on?: boolean;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export interface CuiSwitchControlEmits {
  (e: 'update:on', value: boolean): void;
}
