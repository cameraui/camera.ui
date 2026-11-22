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
  duration?: number;
  durationMax?: number;
  hasDuration?: boolean;
  remaining?: number;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export interface CuiCoverControlEmits {
  'update:targetState': [value: CoverState.Open | CoverState.Closed];
  'update:targetPosition': [value: number];
  'update:targetTilt': [value: number];
  'update:duration': [value: number];
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
  duration: 600,
  durationMax: 3600,
  hasDuration: false,
  remaining: 0,
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiCoverControlProps>;
