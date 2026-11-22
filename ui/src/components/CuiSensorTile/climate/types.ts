import type { ValueRange } from '../range.js';

export type ClimateActivity = 'off' | 'idle' | 'heat' | 'cool';

export type ClimateKnob = 'target' | 'low' | 'high';

export interface ClimateTargets {
  target: number;
  low: number;
  high: number;
}

export interface CuiClimateDialProps {
  range: ValueRange;
  activity: ClimateActivity;
  unit?: string;
  value?: string;
  reading?: string;
  current?: number;
  target?: number;
  low?: number;
  high?: number;
  disabled?: boolean;
}

export interface CuiClimateDialEmits {
  (e: 'input', knob: ClimateKnob, value: number): void;
  (e: 'commit', knob: ClimateKnob, value: number): void;
}
