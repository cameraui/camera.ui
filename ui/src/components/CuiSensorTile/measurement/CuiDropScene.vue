<template>
  <svg class="drop" viewBox="0 0 160 160" aria-hidden="true">
    <defs>
      <clipPath :id="clipId">
        <path :d="DROP" />
      </clipPath>
    </defs>
    <path :d="DROP" class="drop__glass" />
    <g :clip-path="`url(#${clipId})`">
      <g class="drop__water" :style="{ transform: `translateY(${(1 - ratio) * HEIGHT}px)` }">
        <path class="drop__wave" d="M-40 18 q10 -5 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 V140 H-40 Z" />
      </g>
    </g>
    <text v-for="zone in labels" :key="zone.label" x="112" :y="zone.y" class="drop__label" :class="{ 'drop__label--active': zone.active }">{{ zone.label }}</text>
  </svg>
</template>

<script setup lang="ts">
import type { CuiDropSceneProps } from './types.js';

const props = defineProps<CuiDropSceneProps>();

const clipId = useId();

const DROP = 'M60 18 C60 18 26 62 26 94 a34 34 0 0 0 68 0 C94 62 60 18 60 18 Z';
const TOP = 18;
const HEIGHT = 110;

const labels = computed(() =>
  props.zones.flatMap((zone) => (zone.label ? [{ label: zone.label, active: zone.active, y: TOP + HEIGHT * (1 - (zone.from + zone.to) / 2) + 4 }] : [])),
);
</script>

<style scoped>
.drop {
  width: min(100%, 10rem);
  aspect-ratio: 1;
}

.drop__glass {
  fill: var(--p-content-hover-background);
  stroke: var(--border-color);
  stroke-width: 2;
}

.drop__water {
  transition: transform 0.6s ease;
}

.drop__wave {
  fill: color-mix(in srgb, var(--tile-color) 75%, var(--p-content-background));
  animation: drop-wave 3s linear infinite;
  transition: fill 0.4s ease;
}

.drop__label {
  font-size: 11px;
  fill: var(--text-secondary-color);
  opacity: 0.6;
}

.drop__label--active {
  fill: var(--text-color);
  font-weight: 600;
  opacity: 1;
}

@keyframes drop-wave {
  to {
    transform: translateX(40px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .drop__wave {
    animation: none;
  }
}
</style>
