import type { ButtonProps } from 'primevue';
import type { RouteLocationAsPathGeneric, RouteLocationAsRelativeGeneric } from 'vue-router';

export interface CuiListItemProps {
  active?: boolean;
  disabled?: boolean;
  to?: string | RouteLocationAsRelativeGeneric | RouteLocationAsPathGeneric;
  activeClass?: string;
  buttonProps?: ButtonProps;
  tooltip?: string;
  size?: 'default' | 'large';
  divider?: boolean;
  radius?: 'top' | 'bottom' | 'both' | 'none';
}

export interface CuiListItemEmits {
  (e: 'click', event: MouseEvent): void;
}
