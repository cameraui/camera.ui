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
import { EVENT_CATEGORIES } from '@camera.ui/nvr';
import { DETECTION_ATTRIBUTES } from '@camera.ui/sdk';

import { attributeLabelKey, detectionLabelKey } from '@/common/eventLabels.js';
import { resolveEventIcons } from '@/utils/eventIcons.js';
import { showsMotionByDefault } from '@/utils/motionDefault.js';

import { RECENT_EVENTS_FILTER_TYPES, RECENT_EVENTS_OPT_IN_TYPES } from './types.js';

import type { RecentEventTypes } from '@/composables/useRecentEventTypes.js';
import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { DBCamera, EventTypesByCamera } from '@shared/types';
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

function optIn(type: string, camera: DBCamera): boolean {
  return OPT_IN.has(type) && !(type === EVENT_CATEGORIES.motion && showsMotionByDefault(camera));
}

function shownOn(type: string): string[] {
  return props.cameras
    .filter((camera) => (optIn(type, camera) ? shownDraft.value[camera._id]?.includes(type) : !hiddenDraft.value[camera._id]?.includes(type)))
    .map((camera) => camera._id);
}

function shownLabel(type: string): string {
  const n = shownOn(type).length;
  if (n === props.cameras.length) return t('components.camera_events.filter_all_cameras');
  return t('components.camera_events.filter_shown_on', { n, total: props.cameras.length });
}

function setShownOn(type: string, cameraIds: string[]): void {
  const picked = new Set(cameraIds);
  const hidden = { ...hiddenDraft.value };
  const shown = { ...shownDraft.value };
  for (const camera of props.cameras) {
    const id = camera._id;
    const on = optIn(type, camera);
    hidden[id] = (hidden[id] ?? []).filter((entry) => entry !== type);
    shown[id] = (shown[id] ?? []).filter((entry) => entry !== type);
    if (on && picked.has(id)) shown[id].push(type);
    if (!on && !picked.has(id)) hidden[id].push(type);
  }
  hiddenDraft.value = hidden;
  shownDraft.value = shown;
}

defineExpose<CustomDialogComponent>({
  onConfirm: async (): Promise<RecentEventTypes> => ({ hidden: withoutEmpty(hiddenDraft.value), shown: withoutEmpty(shownDraft.value) }),
});
</script>
