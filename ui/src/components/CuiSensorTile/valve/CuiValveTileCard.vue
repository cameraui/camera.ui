<template>
  <CuiTileCard
    ref="cardRef"
    :icon
    :title="name"
    :value="hasPosition ? `${Math.round(position)} %` : undefined"
    :caption="hint || holding ? t('components.sensor_tile.hold_to_open') : stateText"
    :color
    :active="isOpen"
    :fill
    :dragging="dragging || holding"
    :offline="!online"
    :compact="size === 'small'"
    :mini="size === 'mini'"
    class="valve-card"
    role="switch"
    :aria-checked="isOpen"
    :aria-label="name"
    :tabindex="interactive ? 0 : -1"
    @keydown="gas ? onPressKey($event) : onLevelKey($event)"
  />
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileCard from '../frame/CuiTileCard.vue';
import { useCardLevel } from '../useCardLevel.js';
import { useTileSensor } from '../useTileSensor.js';
import { useValve, useValvePress } from './useValve.js';

import type { ComponentPublicInstance } from 'vue';
import type { SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const valve = useValve(() => props.sensor);
const { gas, color, hasPosition, isOpen, position, ratio, remainingRatio, stateText, toggle, inputPosition, commitPosition } = valve;

const KEY_STEP = 0.05;

const cardRef = useTemplateRef<ComponentPublicInstance>('cardRef');
const cardEl = computed(() => cardRef.value?.$el as HTMLElement | undefined);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));

const { dragging, onKey: onLevelKey } = useCardLevel(cardEl, {
  interactive: () => interactive.value && !gas.value,
  draggable: () => hasPosition.value,
  ratio: () => ratio.value,
  keyStep: () => KEY_STEP,
  onInput: inputPosition,
  onCommit: commitPosition,
  onToggle: toggle,
});
const { progress, holding, hint, onKey: onPressKey } = useValvePress(cardEl, valve, () => interactive.value);

const fill = computed(() => {
  if (holding.value) return progress.value;
  if (dragging.value) return ratio.value;
  return remainingRatio.value ?? ratio.value;
});
</script>

<style scoped>
.valve-card {
  touch-action: pan-y;
  -webkit-touch-callout: none;
}
</style>
