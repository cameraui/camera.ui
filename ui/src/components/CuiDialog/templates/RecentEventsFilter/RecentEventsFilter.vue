<template>
  <div class="flex flex-col gap-5 w-full">
    <span class="text-sm text-muted">{{ $t('components.camera_events.filter_hint') }}</span>

    <div v-for="type in typeOptions" :key="type.value" class="flex flex-col field-gap">
      <label :for="`shown-${type.value}`" class="cui-label flex items-center gap-2">
        <component :is="type.icon" class="w-4 h-4 text-muted" />
        {{ type.label }}
      </label>
      <MultiSelect
        :model-value="shownOn(type.value)"
        :input-id="`shown-${type.value}`"
        :options="cameraOptions"
        option-label="label"
        option-value="value"
        :max-selected-labels="2"
        :selected-items-label="shownLabel(type.value)"
        :placeholder="$t('components.camera_events.filter_hidden_everywhere')"
        filter
        fluid
        @update:model-value="(cameraIds: string[]) => setShownOn(type.value, cameraIds)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { DETECTION_ATTRIBUTES } from '@camera.ui/sdk';

import { attributeLabelKey, detectionLabelKey } from '@/common/eventLabels.js';
import { resolveEventIcons } from '@/utils/eventIcons.js';

import { RECENT_EVENTS_FILTER_TYPES } from './types.js';

import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { RecentEventsFilterProps } from './types.js';

const props = defineProps<RecentEventsFilterProps>();

const { t } = useI18n();

const { icons, generic } = resolveEventIcons();

const draft = ref(Object.fromEntries(Object.entries(props.hidden).map(([cameraId, types]) => [cameraId, [...types]])));

const cameraOptions = computed(() => props.cameras.map((camera) => ({ label: camera.name, value: camera._id })));

const typeOptions = computed(() =>
  RECENT_EVENTS_FILTER_TYPES.map((type) => ({
    value: type as string,
    label: t((DETECTION_ATTRIBUTES as readonly string[]).includes(type) ? attributeLabelKey(type) : detectionLabelKey(type)),
    icon: icons[type] ?? generic,
  })),
);

function shownOn(type: string): string[] {
  return props.cameras.filter((camera) => !draft.value[camera._id]?.includes(type)).map((camera) => camera._id);
}

function shownLabel(type: string): string {
  const n = shownOn(type).length;
  if (n === props.cameras.length) return t('components.camera_events.filter_all_cameras');
  return t('components.camera_events.filter_shown_on', { n, total: props.cameras.length });
}

function setShownOn(type: string, cameraIds: string[]): void {
  const shown = new Set(cameraIds);
  const next = { ...draft.value };
  for (const camera of props.cameras) {
    const types = (next[camera._id] ?? []).filter((entry) => entry !== type);
    next[camera._id] = shown.has(camera._id) ? types : [...types, type];
  }
  draft.value = next;
}

defineExpose<CustomDialogComponent>({
  onConfirm: async () => Object.fromEntries(Object.entries(draft.value).filter(([, types]) => types.length > 0)),
});
</script>
