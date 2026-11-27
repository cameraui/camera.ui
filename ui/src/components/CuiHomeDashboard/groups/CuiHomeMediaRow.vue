<template>
  <div class="cui-tile home-media-row" :style="{ '--tile-color': color }">
    <CuiHomeMemberIcon class="home-media-row__lead" :sensor>
      <CuiTileIcon class="home-media-row__icon" :icon :active="playing" />
    </CuiHomeMemberIcon>
    <span class="home-media-row__text">
      <span class="home-media-row__name">{{ sensor.displayName.value }}</span>
      <span class="home-media-row__state" :class="{ 'home-media-row__state--note': note }">{{ detail }}</span>
    </span>
    <input
      v-if="lit && hasVolume && !disabled"
      class="home-media-row__volume"
      :class="{ 'home-media-row__volume--playing': playing }"
      type="range"
      min="0"
      max="100"
      :value="percent"
      :style="{ '--level': `${percent}%` }"
      :disabled="!interactive"
      :aria-label="t('views.home_dashboard.groups.media.volume_of', { name: sensor.displayName.value })"
      @pointerdown="dragging = true"
      @pointerup="dragging = false"
      @pointercancel="dragging = false"
      @input="inputVolume(ratioOf($event))"
      @change="commitVolume(ratioOf($event))"
    />
  </div>
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';
import CuiTileIcon from '@/components/CuiSensorTile/frame/CuiTileIcon.vue';
import { useMediaPlayer } from '@/components/CuiSensorTile/media/useMediaPlayer.js';
import { TILE_WAIT } from '@/components/CuiSensorTile/types.js';
import { useTileWait } from '@/components/CuiSensorTile/useTileWait.js';

import CuiHomeMemberIcon from './CuiHomeMemberIcon.vue';
import { nowPlaying } from './media.js';

import type { CuiHomeMediaRowProps } from './media.js';

const props = defineProps<CuiHomeMediaRowProps>();

const { t } = useI18n();

const { lit, playing, color, hasVolume, percent, stateWord, inputVolume, commitVolume } = useMediaPlayer(() => props.sensor);
const wait = useTileWait(() => props.sensor);
const { note, dragging } = wait;
provide(TILE_WAIT, wait);

const online = computed(() => props.sensor.online.value);
const interactive = computed(() => !props.disabled && online.value);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const detail = computed(() => {
  if (!online.value) return t('connection.offline');
  if (note.value) return note.value;
  return (playing.value ? nowPlaying(props.sensor) : undefined) ?? stateWord.value;
});

function ratioOf(event: Event): number {
  return Number((event.target as HTMLInputElement).value) / 100;
}
</script>

<style scoped>
.home-media-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  height: 3rem;
  padding: 0 0.5rem 0 0.625rem;
  border-radius: 1rem;
  background: var(--p-content-hover-background);
  container-type: inline-size;
}

.home-media-row__lead {
  display: flex;
  flex-shrink: 0;
  border-radius: 50%;
}

.home-media-row .home-media-row__icon {
  width: 2rem;
  height: 2rem;
}

.home-media-row__icon:not(.tile-icon--active) {
  background: color-mix(in srgb, var(--text-color) 7%, var(--p-content-hover-background));
}

.home-media-row__icon :deep(.tile-icon__svg) {
  width: 1.125rem;
  height: 1.125rem;
}

.home-media-row__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.home-media-row__name,
.home-media-row__state {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-media-row__name {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.125rem;
  color: var(--text-color);
}

.home-media-row__state {
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--text-secondary-color);
}

.home-media-row .home-media-row__state--note {
  color: var(--p-red-500);
}

.home-media-row__volume {
  --fill: var(--text-muted-color);
  --track: color-mix(in srgb, var(--text-color) 15%, var(--p-content-hover-background));
  flex: none;
  width: 6rem;
  height: 1.75rem;
  margin: 0;
  background: transparent;
  cursor: pointer;
  touch-action: pan-y;
  -webkit-appearance: none;
  appearance: none;
}

.home-media-row__volume--playing {
  --fill: var(--tile-color);
}

.home-media-row__volume:disabled {
  opacity: 0.5;
  cursor: default;
}

.home-media-row__volume:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
  border-radius: 0.25rem;
}

.home-media-row__volume::-webkit-slider-runnable-track {
  height: 0.375rem;
  border-radius: 9999px;
  background: linear-gradient(90deg, var(--fill) var(--level), var(--track) var(--level));
}

.home-media-row__volume::-webkit-slider-thumb {
  width: 1rem;
  height: 1rem;
  margin-top: -0.3125rem;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  -webkit-appearance: none;
  appearance: none;
}

.home-media-row__volume::-moz-range-track {
  height: 0.375rem;
  border-radius: 9999px;
  background: linear-gradient(90deg, var(--fill) var(--level), var(--track) var(--level));
}

.home-media-row__volume::-moz-range-thumb {
  width: 1rem;
  height: 1rem;
  border: 0;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}

@container (width < 15rem) {
  .home-media-row__volume {
    display: none;
  }
}
</style>
