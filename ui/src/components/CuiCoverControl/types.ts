import { CoverState } from '@camera.ui/sdk';

import type { Component } from 'vue';

export interface CuiCoverControlProps {
  icon: Component;
  currentState?: CoverState;
  obstructionDetected?: boolean;
  position?: number;
  targetPosition?: number;
  hasPosition?: boolean;
  tilt?: number;
  hasTilt?: boolean;
  canStop?: boolean;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export interface CuiCoverControlEmits {
  'update:targetState': [value: CoverState.Open | CoverState.Closed];
  'update:targetPosition': [value: number];
  'update:targetTilt': [value: number];
  stop: [];
}

export const CUI_COVER_CONTROL_DEFAULTS = {
  currentState: CoverState.Closed,
  obstructionDetected: false,
  position: 0,
  targetPosition: 0,
  hasPosition: false,
  tilt: 0,
  hasTilt: false,
  canStop: false,
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiCoverControlProps>;
