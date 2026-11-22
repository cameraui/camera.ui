export interface CuiRockerSwitchProps {
  on: boolean;
  label: string;
  color?: string;
  disabled?: boolean;
}

export interface CuiRockerSwitchEmits {
  (e: 'change', on: boolean): void;
}

export interface CuiOutletSocketProps {
  on: boolean;
  inUse: boolean;
  color?: string;
}
