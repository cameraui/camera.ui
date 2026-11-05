<template>
  <div class="flex flex-col gap-2">
    <template v-for="sensor in sensorOptions" :key="sensor.value">
      <CuiCheckRow :model-value="sensorEvents.includes(sensor.value)" :label="sensor.label" :icon="sensor.icon" plain @update:model-value="toggleSensor(sensor.value)" />
      <div v-if="sensor.value === 'audio' && sensorEvents.includes('audio')" class="flex flex-col gap-2 ml-6">
        <CuiCheckRow
          v-for="sound in soundOptions"
          :key="sound.value"
          :model-value="audioLabels.includes(sound.value)"
          :label="sound.label"
          :icon="sound.icon"
          plain
          @update:model-value="toggleSound(sound.value)"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { toggled } from './filters.js';
import { useTriggerOptions } from './useTriggerOptions.js';

import type { RecordingsSensorFilterProps } from './types.js';

const props = defineProps<RecordingsSensorFilterProps>();

const sensorEvents = defineModel<string[]>('sensorEvents', { required: true });
const audioLabels = defineModel<string[]>('audioLabels', { required: true });

const { sensorOptions, soundOptions } = useTriggerOptions(() => props.types);

function toggleSensor(type: string): void {
  sensorEvents.value = toggled(sensorEvents.value, type);
}

function toggleSound(label: string): void {
  audioLabels.value = toggled(audioLabels.value, label);
}
</script>
