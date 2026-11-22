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
    class="robot-card"
    :class="{ 'robot-card--error': error }"
    role="switch"
    :aria-checked="busy"
    :aria-label="name"
    :tabindex="interactive ? 0 : -1"
    @click="onClick"
    @keydown="onKey"
  >
    <template #corner>
      <CuiTileCornerButton :label="t('components.sensor_tile.controls')" :disabled="!interactive" @click.stop="emit('expand', $event)">
        <TuneIcon />
      </CuiTileCornerButton>
    </template>
    <template v-if="size === 'medium'" #bottom>
      <CuiRobotBar :type="sensor.type" :commands :busy :interactive @command="command" />
    </template>
  </CuiTileCard>
</template>

<script setup lang="ts">
import TuneIcon from '~icons/mdi/tune-variant';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileCard from '../frame/CuiTileCard.vue';
import CuiTileCornerButton from '../frame/CuiTileCornerButton.vue';
import { onToggleKey } from '../keys.js';
import { useTileSensor } from '../useTileSensor.js';
import CuiRobotBar from './CuiRobotBar.vue';
import { useRobot } from './useRobot.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

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
