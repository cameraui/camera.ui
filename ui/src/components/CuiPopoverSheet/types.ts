import type { PopoverProps } from 'openvue';

export interface CuiPopoverSheetProps {
  width?: string;
  shrink?: boolean;
  sheet?: boolean;
  popover?: PopoverProps;
}

export interface CuiPopoverSheetEmits {
  (e: 'show'): void;
  (e: 'hide'): void;
}
