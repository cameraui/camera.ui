export enum LockState {
  Secured = 0,
  Unsecured = 1,
  Unknown = 2,
}

export interface CuiLockControlProps {
  currentState?: LockState;
  targetState?: LockState;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export interface CuiLockControlEmits {
  'update:targetState': [value: LockState];
}

export const CUI_LOCK_CONTROL_DEFAULTS = {
  currentState: LockState.Unknown,
  targetState: LockState.Secured,
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiLockControlProps>;
