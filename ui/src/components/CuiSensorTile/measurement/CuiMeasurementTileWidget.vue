<template>
  <CuiTileWidget
    :icon
    :title="name"
    :state="caption"
    :summary="text ? [text, word].filter(Boolean).join(' · ') : word"
    :color
    :active="!!color"
    :offline="!online"
    :hero="text ?? word"
    :hero-note="text ? word : undefined"
    opens
    @open="emit('expand', $event)"
  >
    <template v-if="readingProperty" #extra>
      <CuiMeasurementTrend class="measurement-widget__trend" bare :sensor :property="readingProperty" :format="(value) => format(value, readingProperty!)" />
    </template>

    <CuiTileScale v-if="ratio !== undefined" :ratio :zones="scaleZones" :gradient="scaleGradient" :color />
  </CuiTileWidget>
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileScale from '../frame/CuiTileScale.vue';
import CuiTileWidget from '../frame/CuiTileWidget.vue';
import { useTileSensor } from '../useTileSensor.js';
import CuiMeasurementTrend from './CuiMeasurementTrend.vue';
import { useMeasurement } from './useMeasurement.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { name, online } = useTileSensor(props);
const { readingProperty, text, ratio, color, word, caption, scaleZones, scaleGradient, format } = useMeasurement(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
</script>

<style scoped>
.measurement-widget__trend {
  align-self: flex-end;
  width: 100%;
}
</style>
