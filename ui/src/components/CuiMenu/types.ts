import type { ButtonProps, PopoverProps } from 'primevue';
import type { HTMLAttributes } from 'vue';

import type { CuiAvatarProps } from '../CuiAvatar/types.js';

export interface MenuItem {
  key?: string;
  label?: string;
  description?: string;
  icon?: any;
  position?: 'header' | 'footer';
  group?: string;
  hide?: boolean;
  active?: boolean;
  disabled?: boolean;
  to?: string;
  toggle?: boolean;
  toggleState?: boolean;
  iconProps?: HTMLAttributes;
  avatarProps?: CuiAvatarProps & HTMLAttributes;
  labelProps?: HTMLAttributes;
  descriptionProps?: HTMLAttributes;
  buttonProps?: ButtonProps;
  badge?: string;
  badgeProps?: HTMLAttributes;
  loading?: boolean;
  tooltip?: string;
  onClick?: (data?: any) => void;
}

export interface CuiMenuProps {
  items: MenuItem[];
  autoHide?: boolean;
  dividers?: 'sections' | 'all';
  popover?: PopoverProps;
  sortList?: boolean;
  maxHeight?: string | number;
}

export interface CuiMenuEmits {
  (e: 'show'): void;
  (e: 'hide'): void;
  (e: 'click:menu-item', item: MenuItem): void;
}

export const CUI_MENU_DEFAULTS = {
  autoHide: true,
  dividers: 'all',
} satisfies Partial<CuiMenuProps>;
