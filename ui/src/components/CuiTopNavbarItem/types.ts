import type { ButtonProps } from 'primevue';

export type TopNavbarItemType = 'button' | 'tab' | 'dropdown';

export type TopNavbarItemStatus = 'connected' | 'connecting' | 'disconnected';

export interface CuiTopNavbarItemProps {
  active?: boolean;
  closeable?: boolean;
  menuOpen?: boolean;
  primary?: boolean;
  type?: TopNavbarItemType;
  status?: TopNavbarItemStatus;
  label?: ButtonProps['label'];
  disabled?: ButtonProps['disabled'];
  badge?: ButtonProps['badge'];
  badgeSeverity?: ButtonProps['badgeSeverity'];
  loading?: ButtonProps['loading'];
}

export interface CuiTopNavbarItemEmits {
  (e: 'click', event: MouseEvent): void;
  (e: 'close'): void;
}
