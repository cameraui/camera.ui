<template>
  <CuiTileCard
    :icon
    :title="name"
    :state="stateText"
    :color
    :active
    :fill="active ? 1 : 0"
    :offline="!online"
    :compact="size === 'small'"
    :mini="size === 'mini'"
    role="switch"
    :aria-checked="active"
    :aria-label="name"
    :tabindex="interactive ? 0 : -1"
    @click="interactive && toggle()"
    @keydown="interactive && onToggleKey($event, toggle)"
  />
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileCard from '../frame/CuiTileCard.vue';
import { onToggleKey } from '../keys.js';
import { useTileSensor } from '../useTileSensor.js';
import { useChime } from './useChime.js';

import type { SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();

const { name, online, interactive } = useTileSensor(props);
const { active, color, stateText, toggle } = useChime(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
</script>
