<template>
  <div class="home-cover-window">
    <span
      class="cui-tile home-cover-window__pane"
      :class="{ 'home-cover-window__pane--interactive': interactive }"
      :style="{ width: `min(100%, ${width}px)`, '--tile-color': color }"
      role="slider"
      :tabindex="interactive ? 0 : -1"
      :aria-label="sensor.displayName.value"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="percent"
      :aria-valuetext="percent ? t('views.home_dashboard.groups.covers.percent_open', { percent }) : t('components.sensor_state.closed')"
      :aria-disabled="!interactive"
      @keydown="onKey"
      @touchstart.passive="touchAt"
      @touchmove="holdScroll"
    >
      <CuiCoverScene
        class="home-cover-window__scene"
        :kind
        :open-ratio="openRatio"
        :tilt="hasTilt ? tilt : undefined"
        :obstructed
        :draggable
        :tap-toggles="interactive"
        @input="(ratio) => inputPosition(step(ratio))"
        @commit="(ratio) => commitPosition(step(ratio))"
        @toggle="toggle"
      />
    </span>
    <button v-if="labeled" type="button" class="home-cover-window__label" aria-haspopup="dialog" @click="emit('open', $event)">
      <span class="home-cover-window__name">{{ name }}</span>
      <span class="home-cover-window__value" :class="{ 'home-cover-window__value--note': note }">
        {{ note ?? (percent ? `${percent} %` : t('views.home_dashboard.groups.covers.closed')) }}
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { CoverKind } from '@camera.ui/sdk';

import CuiCoverScene from '@/components/CuiSensorTile/cover/CuiCoverScene.vue';
import { useCover } from '@/components/CuiSensorTile/cover/useCover.js';
import { onToggleKey } from '@/components/CuiSensorTile/keys.js';
import { TILE_WAIT } from '@/components/CuiSensorTile/types.js';
import { useTileWait } from '@/components/CuiSensorTile/useTileWait.js';

import type { CuiHomeCoverWindowEmits, CuiHomeCoverWindowProps } from './covers.js';

const props = defineProps<CuiHomeCoverWindowProps>();
const emit = defineEmits<CuiHomeCoverWindowEmits>();

const { t } = useI18n();

const { kind, hasPosition, hasTilt, tilt, obstructed, openRatio, color, open, close, toggle, inputPosition, commitPosition } = useCover(() => props.sensor);
const wait = useTileWait(() => props.sensor);
const { note } = wait;
provide(TILE_WAIT, wait);

const KEY_STEPS: Partial<Record<string, number>> = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5, PageUp: 20, PageDown: -20 };
const TOUCH_SLOP = 4;

let touchStart: { x: number; y: number } | undefined;

const interactive = computed(() => !props.disabled && props.sensor.online.value);
const draggable = computed(() => interactive.value && hasPosition.value);
const percent = computed(() => Math.round(openRatio.value * 100));

function step(ratio: number): number {
  return Math.round(ratio * 20) * 5;
}

function onKey(event: KeyboardEvent) {
  if (!interactive.value || onToggleKey(event, toggle)) return;
  const next = keyTarget(event.key);
  if (next === undefined) return;
  event.preventDefault();
  if (hasPosition.value) commitPosition(next);
  else if (next > percent.value) open();
  else if (next < percent.value) close();
}

function keyTarget(key: string): number | undefined {
  if (key === 'Home') return 0;
  if (key === 'End') return 100;
  const delta = KEY_STEPS[key];
  return delta === undefined ? undefined : Math.min(100, Math.max(0, percent.value + delta));
}

function touchAt(event: TouchEvent) {
  const touch = event.touches[0];
  touchStart = { x: touch.clientX, y: touch.clientY };
}

function holdScroll(event: TouchEvent) {
  if (!draggable.value || !touchStart || !event.cancelable) return;
  const touch = event.touches[0];
  const across = Math.abs(touch.clientX - touchStart.x);
  const along = Math.abs(touch.clientY - touchStart.y);
  if (Math.max(across, along) < TOUCH_SLOP) return;
  if (kind.value === CoverKind.Curtain || along >= across) event.preventDefault();
}
</script>

<style scoped>
.home-cover-window {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  min-width: 0;
}

.home-cover-window__pane {
  display: block;
  border-radius: 0.5rem;
  -webkit-touch-callout: none;
}

.home-cover-window__pane--interactive {
  cursor: pointer;
}

.home-cover-window__pane:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.home-cover-window__scene {
  display: block;
}

.home-cover-window__scene.cover-scene--draggable:not(.cover-scene--sideways) {
  touch-action: pan-x;
}

.home-cover-window__label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  max-width: 100%;
  min-width: 0;
  border-radius: 0.375rem;
  background: transparent;
  cursor: pointer;
}

.home-cover-window__label:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.home-cover-window__name,
.home-cover-window__value {
  max-width: 100%;
  font-size: 0.75rem;
  line-height: 1rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-cover-window__name {
  font-weight: 500;
  color: var(--text-color);
}

.home-cover-window__value {
  color: var(--text-secondary-color);
  font-variant-numeric: tabular-nums;
}

.home-cover-window .home-cover-window__value--note {
  color: var(--p-red-500);
}
</style>
