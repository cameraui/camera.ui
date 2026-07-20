<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.camera') }}</label>
      <Select
        :model-value="data.cameraId"
        :options="cameraOptions"
        option-label="label"
        option-value="value"
        :placeholder="t('components.automation_nodes.camera_placeholder')"
        class="w-full"
        @update:model-value="onCameraChange"
      />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.event_phase') }}</label>
      <MultiSelect
        :model-value="data.eventPhase"
        :options="eventPhaseOptions"
        option-label="label"
        option-value="value"
        :placeholder="t('components.automation_nodes.event_phase_placeholder')"
        class="w-full"
        @update:model-value="update('eventPhase', $event)"
      />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.event_phase_multi_hint') }}</Message>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.detection_labels') }}</label>
      <MultiSelect
        :model-value="data.detectionLabels"
        :options="detectionLabelOptions"
        option-label="label"
        option-value="value"
        :placeholder="t('components.automation_nodes.detection_labels_placeholder')"
        class="w-full"
        @update:model-value="update('detectionLabels', $event)"
      />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.detection_labels_hint') }}</Message>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.confidence') }}</label>
      <div class="flex items-center gap-3">
        <Slider
          :model-value="data.confidenceThreshold * 100"
          :min="0"
          :max="100"
          class="flex-1"
          @update:model-value="update('confidenceThreshold', (Number($event) || 0) / 100)"
        />
        <span class="text-sm text-muted w-10 text-right">{{ Math.round(data.confidenceThreshold * 100) }}%</span>
      </div>
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.confidence_hint') }}</Message>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.audio_labels') }}</label>
      <MultiSelect
        :model-value="data.audioLabels"
        :options="audioLabelOptions"
        option-label="label"
        option-value="value"
        :placeholder="t('components.automation_nodes.audio_labels_placeholder')"
        class="w-full"
        @update:model-value="update('audioLabels', $event)"
      />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.audio_labels_hint') }}</Message>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.face_filter') }}</label>
      <AutoComplete
        :model-value="data.faceFilter"
        multiple
        :typeahead="false"
        :placeholder="t('components.automation_nodes.face_filter_placeholder')"
        @update:model-value="update('faceFilter', $event)"
      />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.face_filter_hint') }}</Message>
      <div v-if="faceSuggestions.length" class="flex flex-wrap gap-1.5">
        <Button v-for="name in faceSuggestions" :key="name" severity="secondary" outlined size="small" :label="name" @click="addFace(name)" />
      </div>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.license_plate_filter') }}</label>
      <AutoComplete
        :model-value="data.licensePlateFilter"
        multiple
        :typeahead="false"
        :placeholder="t('components.automation_nodes.license_plate_filter_placeholder')"
        @update:model-value="update('licensePlateFilter', $event)"
      />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.license_plate_filter_hint') }}</Message>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useFaceStore } from '@camera.ui/nvr';

import { useCameraOptions } from './useCameraOptions.js';

import type { ConfigNodeUpdateEmits, ConfigTriggerDetectionProps } from '../types.js';

const props = defineProps<ConfigTriggerDetectionProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();
const { cameraOptions } = useCameraOptions();
const faceStore = useFaceStore();

const eventPhaseOptions = [
  { label: t('components.automation_nodes.event_phase_start'), value: 'start' },
  { label: t('components.automation_nodes.event_phase_update'), value: 'update' },
  { label: t('components.automation_nodes.event_phase_end'), value: 'end' },
  { label: t('components.automation_nodes.event_phase_segment_start'), value: 'segment-start' },
  { label: t('components.automation_nodes.event_phase_segment_update'), value: 'segment-update' },
  { label: t('components.automation_nodes.event_phase_segment_end'), value: 'segment-end' },
];

const detectionLabelOptions = [
  { label: t('components.automation_nodes.label_motion'), value: 'motion' },
  { label: t('components.automation_nodes.label_person'), value: 'person' },
  { label: t('components.automation_nodes.label_vehicle'), value: 'vehicle' },
  { label: t('components.automation_nodes.label_animal'), value: 'animal' },
  { label: t('components.automation_nodes.label_package'), value: 'package' },
  { label: t('components.automation_nodes.label_audio'), value: 'audio' },
];

const audioLabelOptions = [
  { label: t('components.automation_nodes.audio_doorbell'), value: 'doorbell' },
  { label: t('components.automation_nodes.audio_glass_break'), value: 'glass_break' },
  { label: t('components.automation_nodes.audio_scream'), value: 'scream' },
  { label: t('components.automation_nodes.audio_gunshot'), value: 'gunshot' },
  { label: t('components.automation_nodes.audio_dog_bark'), value: 'dog_bark' },
  { label: t('components.automation_nodes.audio_baby_cry'), value: 'baby_cry' },
  { label: t('components.automation_nodes.audio_alarm'), value: 'alarm' },
  { label: t('components.automation_nodes.audio_car_alarm'), value: 'car_alarm' },
  { label: t('components.automation_nodes.audio_smoke_alarm'), value: 'smoke_alarm' },
  { label: t('components.automation_nodes.audio_siren'), value: 'siren' },
  { label: t('components.automation_nodes.audio_speaking'), value: 'speaking' },
  { label: t('components.automation_nodes.audio_cat'), value: 'cat' },
];

const faceSuggestions = computed(() => {
  const selected = new Set(props.data.faceFilter ?? []);
  return faceStore.knownFaces.value.map((face) => face.name).filter((name) => !selected.has(name));
});

function addFace(name: string) {
  update('faceFilter', [...(props.data.faceFilter ?? []), name]);
}

function onCameraChange(value: unknown) {
  emit('update:data', { cameraId: value, detectionLabels: [], faceFilter: [], licensePlateFilter: [] });
}

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}
</script>
