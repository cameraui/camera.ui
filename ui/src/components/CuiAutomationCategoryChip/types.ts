import NotificationIcon from '~icons/mdi/bell-ring';
import RecordingIcon from '~icons/mdi/record-rec';
import PresenceIcon from '~icons/mdi/map-marker-radius';
import DetectionIcon from '~icons/mdi/motion-sensor';
import ScheduleIcon from '~icons/mdi/calendar-clock';
import WebhookIcon from '~icons/mdi/webhook';
import SceneIcon from '~icons/mdi/movie-open';
import UtilityIcon from '~icons/mdi/tools';
import OtherIcon from '~icons/mdi/puzzle';

import type { Component } from 'vue';

export type AutomationCategory = 'notification' | 'recording' | 'presence' | 'detection' | 'schedule' | 'webhook' | 'scene' | 'utility' | 'other';

export interface CuiAutomationCategoryChipProps {
  category?: string;
}

export interface AutomationCategoryMeta {
  icon: Component;
  labelKey: string;
}

export const AUTOMATION_CATEGORY_META: Record<AutomationCategory, AutomationCategoryMeta> = {
  notification: { icon: NotificationIcon, labelKey: 'components.automation_store.category_notification' },
  recording: { icon: RecordingIcon, labelKey: 'components.automation_store.category_recording' },
  presence: { icon: PresenceIcon, labelKey: 'components.automation_store.category_presence' },
  detection: { icon: DetectionIcon, labelKey: 'components.automation_store.category_detection' },
  schedule: { icon: ScheduleIcon, labelKey: 'components.automation_store.category_schedule' },
  webhook: { icon: WebhookIcon, labelKey: 'components.automation_store.category_webhook' },
  scene: { icon: SceneIcon, labelKey: 'components.automation_store.category_scene' },
  utility: { icon: UtilityIcon, labelKey: 'components.automation_store.category_utility' },
  other: { icon: OtherIcon, labelKey: 'components.automation_store.category_other' },
};

export const AUTOMATION_CATEGORY_ORDER: AutomationCategory[] = ['notification', 'recording', 'presence', 'detection', 'schedule', 'webhook', 'scene', 'utility', 'other'];

export function getAutomationCategoryMeta(category?: string): AutomationCategoryMeta {
  if (category && category in AUTOMATION_CATEGORY_META) {
    return AUTOMATION_CATEGORY_META[category as AutomationCategory];
  }
  return AUTOMATION_CATEGORY_META.other;
}
