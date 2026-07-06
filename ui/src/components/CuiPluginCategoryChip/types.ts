import DetectionIcon from '~icons/mdi/motion-sensor';
import CameraSourceIcon from '~icons/mdi/cctv';
import NotificationIcon from '~icons/mdi/bell-ring';
import RecordingIcon from '~icons/mdi/record-rec';
import AutomationIcon from '~icons/mdi/robot';
import AiModelIcon from '~icons/mdi/brain';
import UtilityIcon from '~icons/mdi/tools';
import OtherIcon from '~icons/mdi/puzzle';

import type { Component } from 'vue';

export type PluginCategory = 'detection' | 'camera-source' | 'notification' | 'recording' | 'automation' | 'ai-model' | 'utility' | 'other';

export interface CuiPluginCategoryChipProps {
  category?: string;
}

export interface CategoryMeta {
  icon: Component;
  labelKey: string;
}

export const PLUGIN_CATEGORY_META: Record<PluginCategory, CategoryMeta> = {
  detection: { icon: DetectionIcon, labelKey: 'components.plugin_search.category_detection' },
  'camera-source': { icon: CameraSourceIcon, labelKey: 'components.plugin_search.category_camera_source' },
  notification: { icon: NotificationIcon, labelKey: 'components.plugin_search.category_notification' },
  recording: { icon: RecordingIcon, labelKey: 'components.plugin_search.category_recording' },
  automation: { icon: AutomationIcon, labelKey: 'components.plugin_search.category_automation' },
  'ai-model': { icon: AiModelIcon, labelKey: 'components.plugin_search.category_ai_model' },
  utility: { icon: UtilityIcon, labelKey: 'components.plugin_search.category_utility' },
  other: { icon: OtherIcon, labelKey: 'components.plugin_search.category_other' },
};

export const PLUGIN_CATEGORY_ORDER: PluginCategory[] = ['detection', 'camera-source', 'notification', 'recording', 'automation', 'ai-model', 'utility', 'other'];

export function getCategoryMeta(category?: string): CategoryMeta {
  if (category && category in PLUGIN_CATEGORY_META) {
    return PLUGIN_CATEGORY_META[category as PluginCategory];
  }
  return PLUGIN_CATEGORY_META.other;
}
