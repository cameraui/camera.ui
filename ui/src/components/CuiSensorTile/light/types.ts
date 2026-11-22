import type { LightColor } from '@camera.ui/sdk';
import type { ValueRange } from '../range.js';

export type LightMode = 'white' | 'color';

export interface CuiLightTemperatureProps {
  kelvin: number;
  range: ValueRange;
  disabled?: boolean;
}

export interface CuiLightTemperatureEmits {
  (e: 'input', kelvin: number): void;
  (e: 'commit', kelvin: number): void;
}

export interface CuiLightColorWheelProps {
  color: LightColor;
  disabled?: boolean;
}

export interface CuiLightColorWheelEmits {
  (e: 'input', color: LightColor): void;
  (e: 'commit', color: LightColor): void;
}
