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

import { RECENT_EVENTS_FILTER_TYPES, RECENT_EVENTS_OPT_IN_TYPES } from './types.js';

import type { RecentEventTypes } from '@/composables/useRecentEventTypes.js';
import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { EventTypesByCamera } from '@shared/types';
import type { RecentEventsFilterProps } from './types.js';

const props = defineProps<RecentEventsFilterProps>();

const { t } = useI18n();

const { icons, generic } = resolveEventIcons();

const OPT_IN = new Set<string>(RECENT_EVENTS_OPT_IN_TYPES);

const hiddenDraft = ref(copyTypes(props.hidden));
const shownDraft = ref(copyTypes(props.shown));

const cameraOptions = computed(() => props.cameras.map((camera) => ({ label: camera.name, value: camera._id })));

const typeOptions = computed(() =>
  [...RECENT_EVENTS_FILTER_TYPES, ...RECENT_EVENTS_OPT_IN_TYPES].map((type) => ({
    value: type as string,
    label: t((DETECTION_ATTRIBUTES as readonly string[]).includes(type) ? attributeLabelKey(type) : detectionLabelKey(type)),
    icon: icons[type] ?? generic,
  })),
);

function copyTypes(byCamera: EventTypesByCamera): EventTypesByCamera {
  return Object.fromEntries(Object.entries(byCamera).map(([cameraId, types]) => [cameraId, [...types]]));
}

function withoutEmpty(byCamera: EventTypesByCamera): EventTypesByCamera {
  return Object.fromEntries(Object.entries(byCamera).filter(([, types]) => types.length > 0));
}

function shownOn(type: string): string[] {
  const optIn = OPT_IN.has(type);
  return props.cameras
    .filter((camera) => (optIn ? shownDraft.value[camera._id]?.includes(type) : !hiddenDraft.value[camera._id]?.includes(type)))
    .map((camera) => camera._id);
}

function shownLabel(type: string): string {
  const n = shownOn(type).length;
  if (n === props.cameras.length) return t('components.camera_events.filter_all_cameras');
  return t('components.camera_events.filter_shown_on', { n, total: props.cameras.length });
}

function setShownOn(type: string, cameraIds: string[]): void {
  const optIn = OPT_IN.has(type);
  const draft = optIn ? shownDraft : hiddenDraft;
  const shown = new Set(cameraIds);
  const next = { ...draft.value };
  for (const camera of props.cameras) {
    const types = (next[camera._id] ?? []).filter((entry) => entry !== type);
    next[camera._id] = shown.has(camera._id) === optIn ? [...types, type] : types;
  }
  draft.value = next;
}

defineExpose<CustomDialogComponent>({
  onConfirm: async (): Promise<RecentEventTypes> => ({ hidden: withoutEmpty(hiddenDraft.value), shown: withoutEmpty(shownDraft.value) }),
});
</script>
