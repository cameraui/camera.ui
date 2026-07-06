import type { ButtonProps } from 'primevue';

export interface CuiActionButtonProps {
  label?: string;
  icon?: any;
  iconClass?: string;
  buttonProps?: ButtonProps;
  tooltipProps?: ButtonProps;
  actionText: string;
  actionDuration?: number;
}

export interface CuiActionButtonEmits {
  (e: 'action', event: Event): void;
}
