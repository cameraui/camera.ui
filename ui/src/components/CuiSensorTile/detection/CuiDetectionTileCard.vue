<template>
  <CuiTileCard
    :icon
    :title="name"
    :state="stateText"
    :color
    :active
    :fill="0"
    :offline="!online"
    :compact="size === 'small'"
    role="button"
    :aria-label="name"
    tabindex="0"
    @click="emit('expand', $event)"
    @keydown="onExpandKey($event, (event) => emit('expand', event))"
  />
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileCard from '../frame/CuiTileCard.vue';
import { onExpandKey } from '../keys.js';
import { useTileSensor } from '../useTileSensor.js';
import { useDetection } from './useDetection.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { name, online } = useTileSensor(props);
const { active, color, stateText } = useDetection(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
</script>
