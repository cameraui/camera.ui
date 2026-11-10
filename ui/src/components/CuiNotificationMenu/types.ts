import type { StoredNotification } from '@shared/types';

export interface CuiNotificationItemProps {
  notification: StoredNotification;
  time: string;
}

export interface CuiNotificationItemEmits {
  open: [notification: StoredNotification];
  markSeen: [notification: StoredNotification];
  remove: [notification: StoredNotification];
}

export type NotificationDetailEvents = {
  navigate: () => void;
  toggleSeen: (notification: StoredNotification) => void;
  remove: (notification: StoredNotification) => void;
};

export const NotificationSwipeKey: InjectionKey<Ref<string | undefined>> = Symbol('NotificationSwipe');
