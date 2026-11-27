<template>
  <CuiTileCard
    :icon
    :title="name"
    :state="stateText"
    :color
    :active="busy || error"
    :fill="0"
    :offline="!online"
    :compact="size === 'small'"
    :mini="size === 'mini'"
    class="robot-card"
    :class="{ 'robot-card--error': error }"
    role="switch"
    :aria-checked="busy"
    :aria-label="name"
    :tabindex="interactive ? 0 : -1"
    @click="onClick"
    @keydown="onKey"
  >
    <template v-if="size === 'medium' && !disabled" #bottom>
      <CuiRobotBar :type="sensor.type" :commands :busy :interactive @command="command" />
    </template>
  </CuiTileCard>
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileCard from '../frame/CuiTileCard.vue';
import { onToggleKey } from '../keys.js';
import { useTileSensor } from '../useTileSensor.js';
import CuiRobotBar from './CuiRobotBar.vue';
import { useRobot } from './useRobot.js';

import type { SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();

const { name, online, interactive } = useTileSensor(props);
const { busy, error, color, commands, stateText, toggle, command } = useRobot(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));

function onClick(event: MouseEvent) {
  // the buttons inside the card do their own thing
  if ((event.target as Element).closest('button') || !interactive.value) return;
  toggle();
}

function onKey(event: KeyboardEvent) {
  if (interactive.value && event.target === event.currentTarget) onToggleKey(event, toggle);
}
</script>

<style scoped>
.robot-card--error :deep(.tile-card__state) {
  color: var(--tile-color);
}
</style>
