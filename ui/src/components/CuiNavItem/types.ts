import type { ButtonProps } from 'primevue';

export interface CuiNavItemProps {
  label: string;
  to: string;
  expanded?: boolean;
  description?: string;
  icon?: any;
  iconSize?: number;
  iconClass?: any;
  labelClass?: any;
  activeIcon?: any;
  avatar?: string;
  avatarSize?: number;
  showLogout?: boolean;
  darkMode?: boolean;
  buttonProps?: ButtonProps;
  showTooltip?: boolean;
  fallbackActivePath?: string;
  activeColor?: string;
  activeIconColor?: string;
  bottomBar?: boolean;
}
