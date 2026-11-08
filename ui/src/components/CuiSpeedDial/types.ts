import type { CuiButtonAttrs } from '../CuiButton/types.js';

export interface CuiSpeedDialItem {
  label: string;
  icon: any;
  buttonProps?: CuiButtonAttrs;
  command: () => void;
}

export interface CuiSpeedDialProps {
  model: CuiSpeedDialItem[];
  loading?: boolean;
  subtle?: boolean;
}
