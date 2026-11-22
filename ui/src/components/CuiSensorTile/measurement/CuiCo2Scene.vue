<template>
  <svg class="co2" :class="{ 'co2--poor': poor }" viewBox="0 0 160 160" aria-hidden="true">
    <circle v-for="(bubble, index) in BUBBLES" :key="index" :cx="bubble.x" cy="58" :r="bubble.r" class="co2__bubble" :style="{ animationDelay: `${index * 0.8}s` }" />
    <path d="M48 118 a24 24 0 0 1 -2 -48 a32 32 0 0 1 60 -8 a26 26 0 0 1 8 56 Z" class="co2__cloud" />
    <text x="80" y="100" class="co2__text">CO₂</text>
  </svg>
</template>

<script setup lang="ts">
import type { CuiCo2SceneProps } from './types.js';

const BUBBLES = [
  { x: 62, r: 4 },
  { x: 86, r: 3 },
  { x: 104, r: 3.5 },
  { x: 74, r: 2.5 },
];

defineProps<CuiCo2SceneProps>();
</script>

<style scoped>
.co2 {
  width: min(100%, 10rem);
  aspect-ratio: 1;
}

.co2__cloud {
  fill: color-mix(in srgb, var(--tile-color) 30%, var(--p-content-background));
  stroke: color-mix(in srgb, var(--tile-color) 60%, var(--p-content-background));
  stroke-width: 2;
  transition:
    fill 0.4s ease,
    stroke 0.4s ease;
}

.co2__text {
  font-size: 22px;
  font-weight: 700;
  text-anchor: middle;
  fill: var(--text-color);
}

.co2__bubble {
  fill: none;
  stroke: var(--tile-color);
  stroke-width: 1.5;
  opacity: 0;
}

.co2--poor .co2__bubble {
  animation: co2-rise 3.2s ease-out infinite;
}

@keyframes co2-rise {
  0% {
    opacity: 0;
    transform: translateY(0);
  }
  30% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
    transform: translateY(-40px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .co2--poor .co2__bubble {
    animation: none;
    opacity: 0.7;
  }
}
</style>
