import { Severity } from '@camera.ui/sdk';

import type { Notification, NotifierDevice } from '@camera.ui/sdk';
import type { NotificationFilter } from '../api/schemas/notifications.schema.js';

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
  BackupFailed: 'system.backup.failed',
  WorkerOffline: 'system.worker.offline',
  RemoteOffline: 'system.remote.offline',
  UpdateFailed: 'system.update.failed',
  PluginErrors: 'system.plugin.errors',
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
  { type: SystemNotificationTypeId.BackupFailed, label: 'Scheduled backup failed' },
  { type: SystemNotificationTypeId.WorkerOffline, label: 'Worker offline / back online' },
  { type: SystemNotificationTypeId.RemoteOffline, label: 'Remote access down / restored' },
  { type: SystemNotificationTypeId.UpdateFailed, label: 'Update failed' },
] as const;

export function notificationCameraId(n: { data?: Record<string, unknown> }): string | undefined {
  const cameraId = n.data?.cameraId;
  return typeof cameraId === 'string' && cameraId ? cameraId : undefined;
}

export function notificationPluginId(n: { source: NotificationSource; data?: Record<string, unknown> }): string | undefined {
  if (n.source.kind === 'plugin') return n.source.id;
  const pluginId = n.data?.pluginId;
  return typeof pluginId === 'string' && pluginId ? pluginId : undefined;
}

export function notificationSourceId(n: { source: NotificationSource; data?: Record<string, unknown> }): string | undefined {
  return notificationCameraId(n) ?? notificationPluginId(n);
}

export function notificationBucket(n: { source: NotificationSource; data?: Record<string, unknown> }): string {
  const cameraId = notificationCameraId(n);
  if (cameraId) return `camera:${cameraId}`;
  const pluginId = notificationPluginId(n);
  if (pluginId) return `plugin:${pluginId}`;
  if (n.source.kind === 'automation') return `automation:${n.source.id}`;
  return n.source.id === 'assistant' ? 'assistant' : 'system';
}

export function matchesNotificationFilter(
  n: { source: NotificationSource; data?: Record<string, unknown>; severity?: Severity },
  unread: boolean,
  filter: NotificationFilter,
): boolean {
  switch (filter) {
    case 'unread':
      return unread;
    case 'problems':
      return n.severity === Severity.Warn || n.severity === Severity.Error || n.severity === Severity.Critical;
    case 'cameras':
      return !!notificationCameraId(n);
    case 'plugins':
      return !!notificationPluginId(n) && !notificationCameraId(n);
    case 'system':
      return n.source.kind === 'system' && !notificationPluginId(n);
    case 'automations':
      return n.source.kind === 'automation';
    default:
      return true;
  }
}

export interface SourcesListing {
  plugins: { id: string; name: string }[];
  system: SystemNotificationType[];
}

export interface NotifierDeviceWithSource extends NotifierDevice {
  pluginId: string;
  pluginName: string;
}

export interface TrainingSubmitResult {
  queued: number;
}

export interface TrainingSubmitProgress {
  active: boolean;
  total: number;
  done: number;
  failed: number;
}

export interface TrainingCandidatesChanged {
  cameraId?: string;
  removed?: string[];
}

export interface TrainingSubmissionBox {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TrainingSubmission {
  id: string;
  labels: TrainingSubmissionBox[];
  imageBytes: number;
  createdAt: string;
  usedInWave?: string;
  imageUrl?: string;
}

export interface TrainingSubmissionPage {
  items: TrainingSubmission[];
  nextCursor?: string;
  total?: number;
}
