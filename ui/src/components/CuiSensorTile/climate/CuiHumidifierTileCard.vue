<template>
  <CuiTileCard
    ref="cardRef"
    :icon
    :title="name"
    :value="cardValue"
    :caption="dragging ? t('components.sensor_tile.target') : stateText"
    :color
    :active="on"
    :fill="on ? ratio : 0"
    :dragging
    :offline="!online"
    :compact="size === 'small'"
    :mini="size === 'mini'"
    class="humidifier-card"
    role="switch"
    :aria-checked="on"
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
import { useHumidifier } from './useHumidifier.js';

import type { SensorTileProps } from '../types.js';
import type { ComponentPublicInstance } from 'vue';

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { on, color, ratio, current, targetText, stateText, toggle, inputRatio, commitRatio, percent } = useHumidifier(() => props.sensor);

const KEY_STEP = 0.05;

const cardRef = useTemplateRef<ComponentPublicInstance>('cardRef');
const cardEl = computed(() => cardRef.value?.$el as HTMLElement | undefined);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));

const { dragging, onKey } = useCardLevel(cardEl, {
  interactive: () => interactive.value,
  draggable: () => on.value,
  ratio: () => ratio.value,
  keyStep: () => KEY_STEP,
  onInput: inputRatio,
  onCommit: commitRatio,
  onToggle: toggle,
});

const cardValue = computed(() => {
  if (dragging.value) return targetText.value;
  if (current.value !== undefined) return percent(current.value);
  return on.value ? targetText.value : undefined;
});
</script>

<style scoped>
.humidifier-card {
  touch-action: pan-y;
}
</style>
