<template>
  <CuiTileWidget
    :icon
    :title="name"
    :state="cameraName ?? typeLabel"
    :summary="stateText"
    :color
    :active
    :offline="!online || cameraDisabled"
    :hero="audio ? levelText : reading"
    :hero-note="detail"
    opens
    @open="emit('expand', $event)"
  >
    <template #default="{ form }">
      <div v-if="form === 'tall' && names.length" class="detection-widget__names">
        <span v-for="entry in names" :key="entry" class="detection-widget__name">{{ entry }}</span>
      </div>
      <CuiTileTimeline v-if="form === 'tall'" bare :sensor property="detected" :entries :now />
    </template>
  </CuiTileWidget>
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileTimeline from '../frame/CuiTileTimeline.vue';
import CuiTileWidget from '../frame/CuiTileWidget.vue';
import { useTileSensor } from '../useTileSensor.js';
import { useDetectionPanel } from './useDetection.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { name, online } = useTileSensor(props);
const { audio, cameraDisabled, active, color, names, levelText, stateText, entries, now, cameraName, typeLabel, reading, detail } = useDetectionPanel(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
</script>

<style scoped>
.detection-widget__names {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  max-height: 3.75rem;
  overflow: hidden;
}

.detection-widget__name {
  padding: 0.25rem 0.625rem;
  border-radius: 9999px;
  background: var(--p-content-hover-background);
  font-size: 0.8125rem;
  color: var(--text-color);
}
</style>
