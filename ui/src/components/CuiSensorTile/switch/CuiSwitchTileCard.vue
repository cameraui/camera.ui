<template>
  <CuiTileCard
    :icon
    :title="name"
    :state="stateText"
    :color
    :active="on"
    :offline="!online"
    :compact="size === 'small'"
    :mini="size === 'mini'"
    role="switch"
    :aria-checked="on"
    :aria-label="name"
    :tabindex="interactive ? 0 : -1"
    @click="interactive && toggle()"
    @keydown="onKey"
  />
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileCard from '../frame/CuiTileCard.vue';
import { onToggleKey } from '../keys.js';
import { useTileSensor } from '../useTileSensor.js';
import { useSwitch } from './useSwitch.js';

import type { SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();

const { name, online, interactive } = useTileSensor(props);
const { on, color, stateText, toggle } = useSwitch(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));

function onKey(event: KeyboardEvent) {
  if (interactive.value && event.target === event.currentTarget) onToggleKey(event, toggle);
}
</script>
