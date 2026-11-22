<template>
  <svg class="presence" :class="{ 'presence--home': active }" viewBox="0 0 160 160" aria-hidden="true">
    <path d="M24 74 L80 28 L136 74 V138 H24 Z" class="presence__house" />
    <g class="presence__person">
      <circle cx="80" cy="76" r="13" />
      <path d="M56 132 V118 a24 24 0 0 1 48 0 V132 Z" />
    </g>
  </svg>
</template>

<script setup lang="ts">
import type { CuiBinarySceneProps } from './types.js';

defineProps<CuiBinarySceneProps>();
</script>

<style scoped>
.presence {
  width: min(100%, 10rem);
  aspect-ratio: 1;
}

.presence__house {
  fill: var(--p-content-hover-background);
  stroke: var(--border-color);
  stroke-width: 3;
  stroke-linejoin: round;
}

.presence__person {
  fill: none;
  stroke: var(--text-secondary-color);
  stroke-width: 2;
  stroke-dasharray: 4 4;
  opacity: 0.45;
  transform: translateY(6px);
  transition:
    opacity 0.5s ease,
    transform 0.5s ease,
    fill 0.5s ease,
    stroke 0.5s ease;
}

.presence--home .presence__person {
  fill: var(--tile-color);
  stroke: var(--tile-color);
  stroke-dasharray: none;
  opacity: 1;
  transform: none;
}
</style>
