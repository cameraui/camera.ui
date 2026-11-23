<template>
  <CuiTilePanel :icon :title="name" :state="cameraName ?? typeLabel" :color :active :offline="!online">
    <div class="flex flex-col items-center gap-4">
      <CuiAudioMeter v-if="audio" :level="decibels" :min="levelRange.min" :max="levelRange.max" :text="levelText" :active />
      <CuiDetectionFrame v-else :camera-id="sensor.boundCameraId" :boxes :disabled="cameraDisabled" />

      <CuiTileReading :state="readingText" :detail />

      <div v-if="names.length" class="flex flex-wrap justify-center gap-1.5">
        <Tag v-for="entry in names" :key="entry" :value="entry" severity="secondary" />
      </div>

      <CuiTileTimeline :sensor property="detected" :entries :now />
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import { AudioProperty } from '@camera.ui/sdk';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTilePanel from '../frame/CuiTilePanel.vue';
import CuiTileReading from '../frame/CuiTileReading.vue';
import CuiTileTimeline from '../frame/CuiTileTimeline.vue';
import { sensorRange } from '../range.js';
import { useCameraName } from '../useCameraRecord.js';
import { useSensorHistory } from '../useSensorHistory.js';
import { useTileSensor } from '../useTileSensor.js';
import CuiAudioMeter from './CuiAudioMeter.vue';
import CuiDetectionFrame from './CuiDetectionFrame.vue';
import { useDetection } from './useDetection.js';

import type { SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online } = useTileSensor(props);
const { audio, cameraDisabled, active, color, names, boxes, decibels, levelText, lastTriggered, detectedText, timeAgo } = useDetection(() => props.sensor);
const { entries, now, sinceText } = useSensorHistory(
  () => props.sensor,
  () => 'detected',
);
const cameraName = useCameraName(props.sensor.boundCameraId);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const typeLabel = computed(() => t(`components.camera_options.sensor_type_${props.sensor.type}`));
const levelRange = computed(() => sensorRange(props.sensor, AudioProperty.Decibels, -100, 0));
const readingText = computed(() => {
  if (cameraDisabled.value) return t('components.sensor_tile.camera_disabled');
  return active.value ? detectedText.value : t('components.sensor_state.idle');
});
const last = computed(() => lastTriggered.value ?? entries.value.findLast((entry) => entry.value === true)?.timestamp);
const detail = computed(() => {
  if (active.value) return sinceText.value;
  return last.value === undefined ? undefined : t('components.sensor_tile.last_time', { time: timeAgo(last.value) });
});
</script>
