<template>
  <svg class="fan-scene" :class="{ 'fan-scene--on': lit }" viewBox="0 0 160 160" aria-hidden="true">
    <rect x="76" y="116" width="8" height="30" rx="4" class="fan-scene__stand" />
    <ellipse cx="80" cy="146" rx="30" ry="6" class="fan-scene__stand" />
    <g class="fan-scene__head" :style="headStyle">
      <circle cx="80" cy="66" r="54" class="fan-scene__cage" />
      <g class="fan-scene__blades" :style="{ transform: `rotate(${spin * 360}deg)` }">
        <path v-for="angle in BLADES" :key="angle" :d="BLADE" :transform="`rotate(${angle} 80 66)`" class="fan-scene__blade" />
      </g>
      <circle cx="80" cy="66" r="42" class="fan-scene__ring" />
      <circle cx="80" cy="66" r="10" class="fan-scene__hub" />
    </g>
  </svg>
</template>

<script setup lang="ts">
import { useEasedPhase } from '../useEasedPhase.js';

import type { CuiFanSceneProps } from './types.js';

const BLADES = [0, 72, 144, 216, 288];
const BLADE = 'M80 57 C95 50 100 26 86 19 C74 14 66 32 74 54 Z';
const SWING = 0.6;

const props = defineProps<CuiFanSceneProps>();

const spin = useEasedPhase(() => (props.lit ? (props.reverse ? -1 : 1) * (0.4 + props.ratio * 2.2) : 0));
const swing = useEasedPhase(() => (props.lit && props.oscillating ? 0.1 : 0));

const headStyle = computed(() => {
  const yaw = Math.sin(swing.value * 2 * Math.PI) * SWING;
  return { transform: `translateX(${Math.sin(yaw) * 10}px) scaleX(${Math.cos(yaw)})` };
});
</script>

<style scoped>
.fan-scene {
  width: min(100%, 11rem);
  aspect-ratio: 1;
}

.fan-scene__head,
.fan-scene__blades {
  transform-box: view-box;
  transform-origin: 80px 66px;
}

.fan-scene__stand {
  fill: var(--p-content-hover-background);
  stroke: var(--border-color);
  stroke-width: 2;
}

.fan-scene__cage {
  fill: var(--p-content-hover-background);
  stroke: color-mix(in srgb, var(--text-color) 35%, var(--p-content-background));
  stroke-width: 3;
}

.fan-scene__ring {
  fill: none;
  stroke: color-mix(in srgb, var(--text-color) 18%, var(--p-content-background));
  stroke-width: 1;
}

.fan-scene__blade {
  fill: color-mix(in srgb, var(--text-color) 28%, var(--p-content-background));
  transition: fill 0.3s ease;
}

.fan-scene--on .fan-scene__blade {
  fill: color-mix(in srgb, var(--tile-color) 70%, var(--p-content-background));
}

.fan-scene__hub {
  fill: color-mix(in srgb, var(--text-color) 45%, var(--p-content-background));
}
</style>
