import type { StoredNotification } from '@shared/types';

export interface CuiNotificationDetailProps {
  notification: StoredNotification;
  closable?: boolean;
  showTitle?: boolean;
  centerLink?: boolean;
}

export interface CuiNotificationDetailEmits {
  close: [];
  navigate: [];
  toggleSeen: [notification: StoredNotification];
  remove: [notification: StoredNotification];
}

export const CUI_NOTIFICATION_DETAIL_DEFAULTS = {
  closable: false,
  showTitle: true,
  centerLink: false,
} as const;
