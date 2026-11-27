<template>
  <CuiTileCard
    ref="cardRef"
    :icon
    :title="name"
    :caption="dragging ? t('components.sensor_tile.target') : stateText"
    :value="cardValue"
    :color
    :active="!isOff"
    :fill="isOff ? 0 : hasRange ? ratios.low : ratios.target"
    :fill-color="hasRange ? heatColor : undefined"
    :fill-end="hasRange ? 1 - ratios.high : undefined"
    :fill-end-color="coolColor"
    :dragging
    :offline="!online"
    :compact="size === 'small'"
    :mini="size === 'mini'"
    class="climate-card"
    role="switch"
    :aria-checked="!isOff"
    :aria-label="name"
    :tabindex="interactive ? 0 : -1"
    @keydown="onKey"
  />
</template>

<script setup lang="ts">
import { sensorIcon, toneColor } from '@/common/sensorDisplay.js';

import CuiTileCard from '../frame/CuiTileCard.vue';
import { onStepKey, onToggleKey } from '../keys.js';
import { usePointerDrag } from '../usePointerDrag.js';
import { useTileSensor } from '../useTileSensor.js';
import { useClimate } from './useClimate.js';

import type { SensorTileProps } from '../types.js';
import type { ClimateKnob, ClimateTargets } from './types.js';
import type { ComponentPublicInstance } from 'vue';

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { isOff, hasRange, color, temperatureRange, current, targets, ratios, targetText, stateText, toggle, nudge, setTarget, degrees } = useClimate(() => props.sensor);

const heatColor = toneColor('warn');
const coolColor = toneColor('info');

const cardRef = useTemplateRef<ComponentPublicInstance>('cardRef');
const cardEl = computed(() => cardRef.value?.$el as HTMLElement | undefined);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));

let from: ClimateTargets = targets.value;
let edge: ClimateKnob | undefined;
let delta = 0;

const { dragging } = usePointerDrag(cardEl, {
  axis: 'x',
  draggable: () => interactive.value && !isOff.value,
  onStart: () => {
    from = targets.value;
    edge = undefined;
  },
  onMove: (event, move) => {
    const rect = cardEl.value!.getBoundingClientRect();
    edge ??= hasRange.value ? nearestEdge((event.clientX - rect.left) / rect.width, move.x) : 'target';
    // the whole card spans the whole range, so the fill stays under the finger
    delta = (move.x / rect.width) * (temperatureRange.value.max - temperatureRange.value.min);
    setTarget(edge, from[edge] + delta, false);
  },
  onEnd: () => {
    if (edge) setTarget(edge, from[edge] + delta, true);
  },
  onTap: () => {
    if (interactive.value) toggle();
  },
});

const cardValue = computed(() => {
  if (dragging.value) return targetText.value;
  if (current.value !== undefined) return degrees(current.value);
  return isOff.value ? undefined : targetText.value;
});

function nearestEdge(at: number, direction: number): ClimateKnob {
  const toLow = Math.abs(at - ratios.value.low);
  const toHigh = Math.abs(at - ratios.value.high);
  // ends that touch part in the direction of the swipe
  if (toLow === toHigh) return direction > 0 ? 'high' : 'low';
  return toLow < toHigh ? 'low' : 'high';
}

function onKey(event: KeyboardEvent) {
  if (!interactive.value || event.target !== event.currentTarget || onToggleKey(event, toggle)) return;
  if (!isOff.value) onStepKey(event, (sign) => nudge(targets.value, sign * temperatureRange.value.step, true));
}
</script>

<style scoped>
.climate-card {
  touch-action: pan-y;
}
</style>
