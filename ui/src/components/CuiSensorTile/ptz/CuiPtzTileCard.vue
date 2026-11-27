<template>
  <CuiTileCard
    :icon
    :title="name"
    :state="stateText"
    :color
    :active="moving"
    :offline="!online"
    :compact="size === 'small'"
    :mini="size === 'mini'"
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
import { usePtzState } from './usePtzState.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { name, online } = useTileSensor(props);
const { moving, color, stateText } = usePtzState(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
</script>
