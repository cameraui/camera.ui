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
    role="button"
    :aria-label="name"
    :tabindex="runnable && !interactive ? -1 : 0"
    @click="onClick"
    @keydown="onKey"
  />
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileCard from '../frame/CuiTileCard.vue';
import { onExpandKey, onToggleKey } from '../keys.js';
import { useTileSensor } from '../useTileSensor.js';
import { useEventSensor } from './useEventSensor.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { name, online, interactive } = useTileSensor(props);
const { runnable, active, color, stateText, run } = useEventSensor(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));

function onClick(event: MouseEvent) {
  if (!runnable) return emit('expand', event);
  if ((event.target as Element).closest('button') || !interactive.value) return;
  run();
}

function onKey(event: KeyboardEvent) {
  if (event.target !== event.currentTarget) return;
  if (!runnable) return onExpandKey(event, (expandEvent) => emit('expand', expandEvent));
  if (interactive.value) onToggleKey(event, run);
}
</script>
