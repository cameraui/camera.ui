<template>
  <CuiTilePanel fit :icon :title="name" :state="cameraName ?? typeLabel" :color :active :offline="!online">
    <div class="flex flex-col items-center gap-4">
      <CuiAudioMeter v-if="audio" :level="decibels" :min="levelRange.min" :max="levelRange.max" :text="levelText" :active />
      <CuiDetectionFrame v-else :camera-id="sensor.boundCameraId" :boxes :disabled="cameraDisabled" />

      <CuiTileReading :state="reading" :detail="detail ?? ''" />

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
import { useTileSensor } from '../useTileSensor.js';
import CuiAudioMeter from './CuiAudioMeter.vue';
import CuiDetectionFrame from './CuiDetectionFrame.vue';
import { useDetectionPanel } from './useDetection.js';

import type { SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();

const { name, online } = useTileSensor(props);
const { audio, cameraDisabled, active, color, names, boxes, decibels, levelText, entries, now, cameraName, typeLabel, reading, detail } = useDetectionPanel(
  () => props.sensor,
);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const levelRange = computed(() => sensorRange(props.sensor, AudioProperty.Decibels, -100, 0));
</script>
