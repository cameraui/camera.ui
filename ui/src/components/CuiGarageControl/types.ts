export enum GarageState {
  Open = 0,
  Closed = 1,
  Opening = 2,
  Closing = 3,
  Stopped = 4,
}

export enum GarageTargetState {
  Open = 0,
  Closed = 1,
}

export interface CuiGarageControlProps {
  currentState?: number;
  targetState?: number;
  obstructionDetected?: boolean;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export interface CuiGarageControlEmits {
  'update:targetState': [value: GarageTargetState];
}

export const CUI_GARAGE_CONTROL_DEFAULTS = {
  currentState: GarageState.Closed,
  targetState: GarageTargetState.Closed,
  obstructionDetected: false,
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiGarageControlProps>;
