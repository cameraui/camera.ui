<template>
  <svg class="thermometer" viewBox="0 0 160 160" aria-hidden="true">
    <path d="M66 111 V24 A14 14 0 0 1 94 24 V111 A22 22 0 1 1 66 111 Z" class="thermometer__glass" />
    <line v-for="y in TICKS" :key="y" x1="100" :y1="y" x2="106" :y2="y" class="thermometer__tick" />
    <rect x="74" y="24" width="12" height="96" rx="6" class="thermometer__column" :style="{ transform: `scaleY(${Math.max(ratio, 0.06)})` }" />
    <circle cx="80" cy="128" r="15" class="thermometer__bulb" />
  </svg>
</template>

<script setup lang="ts">
import type { CuiRatioSceneProps } from './types.js';

const TICKS = [28, 46, 64, 82, 100];

defineProps<CuiRatioSceneProps>();
</script>

<style scoped>
.thermometer {
  width: min(100%, 10rem);
  aspect-ratio: 1;
}

.thermometer__glass {
  fill: var(--p-content-hover-background);
  stroke: var(--border-color);
  stroke-width: 2;
}

.thermometer__tick {
  stroke: var(--text-secondary-color);
  stroke-width: 1.5;
  stroke-linecap: round;
  opacity: 0.5;
}

.thermometer__column,
.thermometer__bulb {
  fill: var(--tile-color);
  transition:
    transform 0.5s ease,
    fill 0.4s ease;
}

.thermometer__column {
  transform-box: fill-box;
  transform-origin: center bottom;
}
</style>
