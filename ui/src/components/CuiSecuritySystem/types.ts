export enum SecuritySystemState {
  StayArm = 0,
  AwayArm = 1,
  NightArm = 2,
  Disarmed = 3,
  AlarmTriggered = 4,
}

export interface CuiSecuritySystemProps {
  currentState?: SecuritySystemState;
  targetState?: SecuritySystemState;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export interface CuiSecuritySystemEmits {
  (e: 'update:currentState', value: SecuritySystemState): void;
  (e: 'update:targetState', value: SecuritySystemState): void;
}
