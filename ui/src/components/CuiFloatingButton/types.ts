import type { TooltipValue } from '@/plugins/tooltip.js';
import type { CuiButtonAttrs } from '../CuiButton/types.js';

export interface CuiFloatingButtonProps {
  buttonProps?: CuiButtonAttrs;
  tooltipProps?: TooltipValue;
  label?: string;
  icon?: any;
  iconProps?: Record<string, any>;
}

export interface CuiFloatingButtonEmits {
  (e: 'click'): void;
}
