import { Severity } from '@camera.ui/sdk';
import { notificationCameraId, notificationPluginId } from '@shared/types';
import CameraIcon from '~icons/bx/cctv';
import AutomationIcon from '~icons/material-symbols/automation-outline';
import WarnIcon from '~icons/mdi/alert';
import ErrorIcon from '~icons/mdi/alert-circle';
import PluginIcon from '~icons/mdi/puzzle-outline';
import SystemIcon from '~icons/mdi/server-outline';
import AssistantIcon from '~icons/tabler/sparkles';

import { notificationImageUrl } from '@/common/utils.js';

import type { StoredNotification } from '@shared/types';
import type { Component } from 'vue';

const DAY = 24 * 60 * 60_000;

export function useNotificationDisplay() {
  const { t, locale } = useI18n();

  function sourceOf(item: StoredNotification): { icon: Component; label: string } {
    const pluginId = notificationPluginId(item);
    if (item.source.kind === 'automation') return { icon: AutomationIcon, label: item.sourceName ?? t('views.notifications.source_automation') };
    if (item.source.id === 'assistant') return { icon: AssistantIcon, label: t('views.notifications.source_assistant') };
    if (pluginId) return { icon: notificationCameraId(item) ? CameraIcon : PluginIcon, label: item.sourceName ?? pluginId };
    return { icon: SystemIcon, label: t('views.notifications.source_system') };
  }

  function cameraNameOf(item: StoredNotification): string | undefined {
    const stored = item.data?.cameraName;
    return item.cameraName ?? (typeof stored === 'string' ? stored : undefined);
  }

  function summaryOf(item: StoredNotification): string | undefined {
    return item.subtitle || item.body || item.log?.messages[0]?.text;
  }

  function occurrencesOf(item: StoredNotification): string | undefined {
    if (!item.log || item.log.count < 2) return undefined;

    const { count, lastAt, messages } = item.log;
    const summary = occurrenceLabel(count, lastAt);
    const others = messages.length - 1;
    return others ? `${summary} · ${t('views.notifications.log_other', { count: others }, others)}` : summary;
  }

  function occurrenceLabel(count: number, lastAt: number): string {
    return t('views.notifications.log_count', { count, time: formatTime(lastAt) }, count);
  }

  function showsSource(item: StoredNotification): boolean {
    return sourceOf(item).label !== item.title;
  }

  function imageOf(item: StoredNotification): string | undefined {
    return notificationImageUrl(item.imageUrl);
  }

  function videoOf(item: StoredNotification): string | undefined {
    return notificationImageUrl(item.videoUrl);
  }

  function isError(item: StoredNotification): boolean {
    return item.severity === Severity.Error || item.severity === Severity.Critical;
  }

  function severityLabel(item: StoredNotification): string | undefined {
    if (item.severity === Severity.Warn) return t('components.notification_menu.warn');
    if (isError(item)) return t('components.notification_menu.error');
    return undefined;
  }

  function severityIcon(item: StoredNotification): Component | undefined {
    if (item.severity === Severity.Warn) return WarnIcon;
    if (isError(item)) return ErrorIcon;
    return undefined;
  }

  function severityTextClass(item: StoredNotification): string {
    return isError(item) ? 'text-red-500' : 'text-orange-500';
  }

  function tileClass(item: StoredNotification): string {
    if (isError(item)) return 'bg-red-500/10 text-red-500';
    if (item.severity === Severity.Warn) return 'bg-orange-500/10 text-orange-500';
    return 'bg-primary-500/10 text-primary-500';
  }

  function dayLabel(timestamp: number): string {
    const day = new Date(timestamp).toDateString();
    if (day === new Date().toDateString()) return t('views.notifications.today');
    if (day === new Date(Date.now() - DAY).toDateString()) return t('views.notifications.yesterday');
    return new Intl.DateTimeFormat(locale.value, { weekday: 'long', day: 'numeric', month: 'long' }).format(timestamp);
  }

  function formatTime(timestamp: number): string {
    return new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit' }).format(timestamp);
  }

  function formatDateTime(timestamp: number): string {
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
  }

  return {
    sourceOf,
    cameraNameOf,
    summaryOf,
    occurrencesOf,
    occurrenceLabel,
    showsSource,
    imageOf,
    videoOf,
    isError,
    severityLabel,
    severityIcon,
    severityTextClass,
    tileClass,
    dayLabel,
    formatTime,
    formatDateTime,
  };
}
