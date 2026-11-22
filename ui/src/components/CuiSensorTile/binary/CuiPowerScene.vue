<template>
  <svg class="power" :class="{ 'power--on': active }" viewBox="0 0 160 160" aria-hidden="true">
    <rect x="34" y="30" width="92" height="92" rx="22" class="power__socket" />
    <circle cx="64" cy="66" r="6" class="power__hole" />
    <circle cx="96" cy="66" r="6" class="power__hole" />
    <path d="M84 80 L68 104 H80 L76 122 L94 94 H82 Z" class="power__bolt" />
    <path d="M80 122 V144" class="power__cable" />
  </svg>
</template>

<script setup lang="ts">
import type { CuiBinarySceneProps } from './types.js';

defineProps<CuiBinarySceneProps>();
</script>

<style scoped>
.power {
  width: min(100%, 10rem);
  aspect-ratio: 1;
}

.power__socket {
  fill: var(--p-content-hover-background);
  stroke: var(--border-color);
  stroke-width: 2;
}

.power__hole {
  fill: color-mix(in srgb, var(--text-color) 55%, var(--p-content-background));
}

.power__bolt {
  fill: color-mix(in srgb, var(--text-color) 25%, var(--p-content-background));
  transition:
    fill 0.4s ease,
    filter 0.4s ease;
}

.power--on .power__bolt {
  fill: var(--tile-color);
  filter: drop-shadow(0 0 6px var(--tile-color));
}

.power__cable {
  stroke: var(--border-color);
  stroke-width: 6;
  stroke-linecap: round;
}
</style>
