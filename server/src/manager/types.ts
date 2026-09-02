import type { Notification, NotifierDevice } from '@camera.ui/sdk';

export type NotificationSourceKind = 'plugin' | 'system' | 'automation';

export interface NotificationSource {
  id: string;
  kind: NotificationSourceKind;
}

export interface NotifyOptions {
  notification: Notification;
  source: NotificationSource;
  targets?: string[];
}

export interface ResolvedNotification extends Notification {
  id: string;
  createdAt: number;
  source: NotificationSource;
}

export interface SystemNotificationType {
  type: string;
  label: string;
  description?: string;
}

export const SystemNotificationTypeId = {
  PluginUpdateAvailable: 'system.plugin.update_available',
  PluginCrashed: 'system.plugin.crashed',
  PluginIncompatible: 'system.plugin.incompatible',
  UpdateAvailable: 'system.update.available',
  AppUpdateAvailable: 'system.app.update_available',
  WorkerUpdateAvailable: 'system.worker.update_available',
  CloudReauth: 'system.cloud.reauth_required',
} as const;

export type SystemNotificationTypeId = (typeof SystemNotificationTypeId)[keyof typeof SystemNotificationTypeId];

export const SYSTEM_NOTIFICATION_TYPES: readonly SystemNotificationType[] = [
  { type: SystemNotificationTypeId.PluginUpdateAvailable, label: 'Plugin updates available' },
  { type: SystemNotificationTypeId.PluginCrashed, label: 'Plugin crashed / recovered' },
  { type: SystemNotificationTypeId.PluginIncompatible, label: 'Plugin incompatible with server' },
  { type: SystemNotificationTypeId.UpdateAvailable, label: 'Server update available' },
  { type: SystemNotificationTypeId.AppUpdateAvailable, label: 'App update available' },
  { type: SystemNotificationTypeId.WorkerUpdateAvailable, label: 'Worker updates available' },
  { type: SystemNotificationTypeId.CloudReauth, label: 'Cloud sign-in required' },
] as const;

export interface SourcesListing {
  plugins: { id: string; name: string }[];
  system: SystemNotificationType[];
}

export interface NotifierDeviceWithSource extends NotifierDevice {
  pluginId: string;
  pluginName: string;
}
