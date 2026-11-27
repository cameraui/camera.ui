<template>
  <CuiTileCard
    ref="cardRef"
    :icon
    :title="name"
    :state="stateText"
    :value="lit && hasBrightness ? `${percent} %` : undefined"
    :color="lightColor"
    :active="lit"
    :fill="lit ? level : 0"
    :dragging
    :offline="!online"
    :compact="size === 'small'"
    :mini="size === 'mini'"
    class="light-card"
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
import { useLight } from './useLight.js';

import type { SensorTileProps } from '../types.js';
import type { ComponentPublicInstance } from 'vue';

const props = defineProps<SensorTileProps>();

const { name, online, interactive } = useTileSensor(props);
const { on, lit, hasBrightness, level, percent, lightColor, stateText, toggle, inputLevel, commitLevel } = useLight(() => props.sensor);

const KEY_STEP = 0.1;

const cardRef = useTemplateRef<ComponentPublicInstance>('cardRef');
const cardEl = computed(() => cardRef.value?.$el as HTMLElement | undefined);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));

const { dragging, onKey } = useCardLevel(cardEl, {
  interactive: () => interactive.value,
  draggable: () => hasBrightness.value,
  ratio: () => (on.value ? level.value : 0),
  keyStep: () => KEY_STEP,
  onInput: inputLevel,
  onCommit: commitLevel,
  onToggle: toggle,
});
</script>

<style scoped>
.light-card {
  touch-action: pan-y;
}
</style>
