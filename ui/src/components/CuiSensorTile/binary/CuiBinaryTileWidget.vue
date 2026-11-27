<template>
  <CuiTileWidget
    :icon
    :title="name"
    :state="headline"
    :summary="stateText"
    :color
    :active
    :offline="!online"
    :hero="stateText"
    :hero-note="sinceText"
    opens
    @open="emit('expand', $event)"
  >
    <template #default="{ form }">
      <CuiTileTimeline v-if="form === 'tall'" bare :sensor :property :entries :now />
    </template>
  </CuiTileWidget>
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileTimeline from '../frame/CuiTileTimeline.vue';
import CuiTileWidget from '../frame/CuiTileWidget.vue';
import { useSensorHistory } from '../useSensorHistory.js';
import { useTileSensor } from '../useTileSensor.js';
import { useBinary } from './useBinary.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { name, online } = useTileSensor(props);
const { property, active, color, stateText, headline } = useBinary(() => props.sensor);
const { entries, now, sinceText } = useSensorHistory(
  () => props.sensor,
  () => property,
);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
</script>
