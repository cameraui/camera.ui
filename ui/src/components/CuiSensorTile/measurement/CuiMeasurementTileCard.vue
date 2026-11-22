<template>
  <CuiTileCard
    :icon
    :title="name"
    :state="cardState"
    :value="text ?? (isAirQuality ? word : undefined)"
    :caption="text ? caption : undefined"
    :color
    :active="!!color"
    :fill="0"
    :offline="!online"
    :compact="size === 'small'"
    role="button"
    :aria-label="name"
    tabindex="0"
    @click="emit('expand', $event)"
    @keydown="onExpandKey($event, (event) => emit('expand', event))"
  >
    <template v-if="ratio !== undefined" #bottom>
      <CuiTileScale :ratio :zones="scaleZones" :gradient="scaleGradient" :color :thin="size === 'small'" />
    </template>
  </CuiTileCard>
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileCard from '../frame/CuiTileCard.vue';
import CuiTileScale from '../frame/CuiTileScale.vue';
import { onExpandKey } from '../keys.js';
import { useTileSensor } from '../useTileSensor.js';
import { useMeasurement } from './useMeasurement.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { name, online } = useTileSensor(props);
const { isAirQuality, text, ratio, color, word, caption, cardState, scaleZones, scaleGradient } = useMeasurement(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
</script>
