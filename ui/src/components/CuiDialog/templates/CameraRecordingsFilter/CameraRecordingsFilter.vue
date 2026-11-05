<template>
  <div class="flex flex-col gap-5 w-full">
    <div class="flex items-center justify-between gap-3">
      <span class="text-sm text-muted">{{ $t('views.camera.recordings_filter_hint') }}</span>
      <Button v-if="filtered" :label="$t('components.form.button.reset')" text size="small" class="shrink-0" @click="reset" />
    </div>

    <div class="flex flex-col field-gap">
      <label for="camera-recordings-search" class="cui-label">{{ $t('views.recordings.search') }}</label>
      <IconField>
        <InputIcon>
          <i-tabler:search class="w-3.5 h-3.5" />
        </InputIcon>
        <InputText id="camera-recordings-search" v-model="draft.search" :placeholder="$t('views.recordings.search_placeholder')" fluid />
      </IconField>
    </div>

    <div class="flex flex-col field-gap">
      <label for="camera-recordings-day" class="cui-label">{{ $t('views.recordings.date') }}</label>
      <DatePicker
        :model-value="draft.day"
        input-id="camera-recordings-day"
        :max-date="today"
        show-icon
        show-button-bar
        fluid
        @update:model-value="(value) => (draft.day = value instanceof Date ? value : undefined)"
      />
    </div>

    <div class="flex flex-col field-gap">
      <label for="camera-recordings-labels" class="cui-label">{{ $t('views.recordings.event_type') }}</label>
      <MultiSelect
        v-model="draft.types"
        input-id="camera-recordings-labels"
        :options="typeOptions"
        option-label="label"
        option-value="value"
        :placeholder="$t('views.recordings.all_labels')"
        :max-selected-labels="2"
        :show-toggle-all="false"
        show-clear
        fluid
      >
        <template #option="{ option }">
          <component :is="option.icon" class="w-4 h-4 shrink-0 text-muted" />
          <span>{{ option.label }}</span>
        </template>
      </MultiSelect>
    </div>

    <div v-if="sensorOptions.length" class="flex flex-col field-gap">
      <label for="camera-recordings-triggers" class="cui-label">{{ $t('views.recordings.sensor_events') }}</label>
      <MultiSelect
        v-model="triggers"
        input-id="camera-recordings-triggers"
        :options="triggerOptions"
        option-label="label"
        option-value="value"
        :option-group-label="hasAudio ? 'label' : undefined"
        :option-group-children="hasAudio ? 'items' : undefined"
        :placeholder="$t('views.recordings.all_triggers')"
        :max-selected-labels="2"
        :show-toggle-all="false"
        show-clear
        fluid
      >
        <template #option="{ option }">
          <component :is="option.icon" class="w-4 h-4 shrink-0 text-muted" />
          <span>{{ option.label }}</span>
        </template>
      </MultiSelect>
    </div>

    <div v-if="camera?.assignments?.object" class="flex flex-col field-gap">
      <label for="camera-recordings-vehicles" class="cui-label">{{ $t('views.recordings.vehicles') }}</label>
      <InputGroup>
        <MultiSelect
          v-model="draft.vehicleTypes"
          input-id="camera-recordings-vehicles"
          :options="vehicleTypeOptions"
          option-label="label"
          option-value="value"
          :placeholder="$t('views.recordings.all_vehicles')"
          :max-selected-labels="2"
          :show-toggle-all="false"
          show-clear
          class="min-w-0"
        />
        <InputGroupAddon>
          <Button
            v-tooltip.top="$t('views.recordings.vehicle_color')"
            type="button"
            severity="secondary"
            text
            :aria-label="$t('views.recordings.vehicle_color')"
            @click="colorPopover?.toggle($event)"
          >
            <span v-if="draft.vehicleColors.length" class="flex -space-x-1.5">
              <span v-for="color in draft.vehicleColors" :key="color" class="color-dot" :style="{ background: VEHICLE_SWATCHES[color] }" />
            </span>
            <i-tabler:palette v-else class="w-4 h-4" />
          </Button>
        </InputGroupAddon>
      </InputGroup>
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.recordings.vehicle_filter_hint') }}</Message>
      <Popover ref="colorPopover">
        <RecordingsColorSwatches v-model="draft.vehicleColors" />
      </Popover>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ $t('views.recordings.confidence') }}</label>
      <div class="flex items-center gap-3">
        <Slider
          :model-value="draft.minConfidence"
          :min="0"
          :max="1"
          :step="0.05"
          class="flex-1"
          @update:model-value="(value) => (draft.minConfidence = value as number)"
        />
        <span class="text-xs font-mono w-8 text-right shrink-0">{{ Math.round(draft.minConfidence * 100) }}%</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useCameraById, useSensors } from '@camera.ui/browser';
import { EVENT_TYPE_OTHER, VEHICLE_TYPES } from '@camera.ui/nvr';
import { DETECTION_ATTRIBUTES, EVENT_TRIGGER_TYPES, OBJECT_DETECTION_LABELS } from '@camera.ui/sdk';

import { vehicleTypeKey } from '@/common/eventLabels.js';
import { cameraFilterSet } from '@/components/CuiCameraRecordings/filter.js';
import { CAMERA_RECORDINGS_FILTER_DEFAULTS } from '@/components/CuiCameraRecordings/types.js';
import { VEHICLE_SWATCHES } from '@/components/CuiRecordings/filters.js';
import { useTriggerOptions } from '@/components/CuiRecordings/useTriggerOptions.js';
import { resolveEventIcons } from '@/utils/eventIcons.js';

import type { CameraRecordingsFilterState } from '@/components/CuiCameraRecordings/types.js';
import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { Popover } from 'openvue';
import type { CameraRecordingsFilterProps } from './types.js';

const props = defineProps<CameraRecordingsFilterProps>();

const { t } = useI18n();
const { camera: cameraDevice } = useCameraById(() => props.cameraName);
const { sensors } = useSensors(cameraDevice);

const { icons, generic } = resolveEventIcons();

const today = new Date();

const SENSOR_TRIGGERS: Record<string, string> = { securitySystem: 'security_system', object: 'line-crossing' };

const SOUND_PREFIX = 'sound:';

const typeOptions = [
  ...OBJECT_DETECTION_LABELS.map((label) => ({ value: label as string, label: t(`views.recordings.type_${label}`), icon: icons[label] ?? generic })),
  ...DETECTION_ATTRIBUTES.map((attribute) => ({ value: attribute as string, label: t(`views.recordings.attr_${attribute}`), icon: icons[attribute] ?? generic })),
  { value: EVENT_TYPE_OTHER as string, label: t('views.recordings.type_other'), icon: icons['other'] ?? generic },
];

const vehicleTypeOptions = VEHICLE_TYPES.map((type) => ({ value: type as string, label: t(vehicleTypeKey(type)) }));

const colorPopover = useTemplateRef<InstanceType<typeof Popover>>('colorPopover');

const draft = ref<CameraRecordingsFilterState>(structuredClone(toRaw(props.filter)));

const sensorTypes = computed(() => {
  // the trigger a sensor of this kind raises, line crossings come with the object detection
  const triggers = new Set<string>(sensors.value.map((sensor) => SENSOR_TRIGGERS[sensor.type] ?? sensor.type));
  return EVENT_TRIGGER_TYPES.filter((type) => triggers.has(type));
});

const { sensorOptions, soundOptions } = useTriggerOptions(sensorTypes);

const hasAudio = computed(() => sensorTypes.value.includes('audio'));

const triggerOptions = computed(() => {
  if (!hasAudio.value) return sensorOptions.value;
  return [
    { label: t('views.recordings.trigger_sensors'), items: sensorOptions.value },
    { label: t('views.recordings.trigger_sounds'), items: soundOptions.value.map((sound) => ({ ...sound, value: SOUND_PREFIX + sound.value })) },
  ];
});

const triggers = computed({
  get: () => [...draft.value.sensorEvents, ...draft.value.audioLabels.map((label) => SOUND_PREFIX + label)],
  set: (values: string[]) => {
    draft.value.sensorEvents = values.filter((value) => !value.startsWith(SOUND_PREFIX));
    draft.value.audioLabels = values.filter((value) => value.startsWith(SOUND_PREFIX)).map((value) => value.slice(SOUND_PREFIX.length));
  },
});

const filtered = computed(() => cameraFilterSet(draft.value));

function reset(): void {
  draft.value = structuredClone(CAMERA_RECORDINGS_FILTER_DEFAULTS);
}

defineExpose<CustomDialogComponent>({
  onConfirm: async (): Promise<CameraRecordingsFilterState> => ({ ...draft.value, search: draft.value.search.trim() }),
});
</script>

<style scoped>
.color-dot {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
}
</style>
