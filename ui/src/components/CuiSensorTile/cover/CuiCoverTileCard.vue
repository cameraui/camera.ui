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
    class="cover-card"
    role="switch"
    :aria-checked="isOpen"
    :aria-label="name"
    :tabindex="interactive ? 0 : -1"
    @keydown="onKey"
  >
    <template v-if="hasTilt" #corner>
      <CuiTileCornerButton class="cover-card__slats" :label="t('components.sensor_tile.adjust_slats')" :disabled="!interactive" @click="emit('expand', $event)">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <line v-for="y in SLAT_ROWS" :key="y" x1="5" :y1="y" x2="15" :y2="y" :style="{ transform: `rotate(${slatAngle}deg)` }" />
        </svg>
      </CuiTileCornerButton>
    </template>
  </CuiTileCard>
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileCard from '../frame/CuiTileCard.vue';
import CuiTileCornerButton from '../frame/CuiTileCornerButton.vue';
import { useCardLevel } from '../useCardLevel.js';
import { useTileSensor } from '../useTileSensor.js';
import { useCover } from './useCover.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';
import type { ComponentPublicInstance } from 'vue';

const KEY_STEP = 0.1;
const SLAT_ROWS = [6, 10, 14];

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { hasPosition, hasTilt, obstructed, position, tilt, isOpen, openRatio, color, stateText, toggle, inputPosition, commitPosition } = useCover(() => props.sensor);
// open slats lie flat, closed ones stand almost upright
const slatAngle = computed(() => (1 - tilt.value / 100) * 70);

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

.cover-card__slats svg {
  width: 100%;
  height: 100%;
}

.cover-card__slats line {
  stroke: var(--text-secondary-color);
  stroke-width: 2;
  stroke-linecap: round;
  transform-box: fill-box;
  transform-origin: center;
  transition: transform 0.3s ease;
}
</style>
