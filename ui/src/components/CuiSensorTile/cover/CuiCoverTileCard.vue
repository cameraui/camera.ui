<template>
  <CuiTileCard
    ref="cardRef"
    :icon
    :title="name"
    :state="stateText"
    :value="hasPosition && isOpen ? `${position} %` : undefined"
    :color
    :active="isOpen || obstructed"
    :fill="obstructed ? 1 : openRatio"
    :dragging
    :offline="!online"
    :compact="size === 'small'"
    :mini="size === 'mini'"
    class="cover-card"
    role="switch"
    :aria-checked="isOpen"
    :aria-label="name"
    :tabindex="interactive ? 0 : -1"
    @keydown="onKey"
  />
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileCard from '../frame/CuiTileCard.vue';
import { useCardLevel } from '../useCardLevel.js';
import { useTileSensor } from '../useTileSensor.js';
import { useCover } from './useCover.js';

import type { SensorTileProps } from '../types.js';
import type { ComponentPublicInstance } from 'vue';

const props = defineProps<SensorTileProps>();

const { name, online, interactive } = useTileSensor(props);
const { hasPosition, obstructed, position, isOpen, openRatio, color, stateText, toggle, inputPosition, commitPosition } = useCover(() => props.sensor);

const KEY_STEP = 0.1;

const cardRef = useTemplateRef<ComponentPublicInstance>('cardRef');
const cardEl = computed(() => cardRef.value?.$el as HTMLElement | undefined);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));

const { dragging, onKey } = useCardLevel(cardEl, {
  interactive: () => interactive.value,
  draggable: () => hasPosition.value,
  ratio: () => openRatio.value,
  keyStep: () => KEY_STEP,
  onInput: (ratio) => inputPosition(Math.round(ratio * 100)),
  onCommit: (ratio) => commitPosition(Math.round(ratio * 100)),
  onToggle: toggle,
});
</script>

<style scoped>
.cover-card {
  touch-action: pan-y;
}
</style>
