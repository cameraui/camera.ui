<template>
  <svg class="valve" :class="{ 'valve--flowing': flowing }" viewBox="0 0 200 120" aria-hidden="true">
    <rect x="8" y="62" width="184" height="26" rx="6" class="valve__pipe" />
    <line x1="14" y1="75" x2="186" y2="75" class="valve__flow" />
    <rect x="76" y="54" width="48" height="42" rx="8" class="valve__body" />
    <rect x="96" y="40" width="8" height="16" rx="2" class="valve__stem" />
    <g class="valve__lever" :style="{ transform: `rotate(${(1 - ratio) * 90}deg)` }">
      <rect x="100" y="32" width="64" height="12" rx="6" class="valve__handle" />
      <circle cx="100" cy="38" r="9" class="valve__hub" />
    </g>
  </svg>
</template>

<script setup lang="ts">
import type { CuiValveSceneProps } from './types.js';

defineProps<CuiValveSceneProps>();
</script>

<style scoped>
.valve {
  width: min(100%, 14rem);
}

.valve__pipe {
  fill: var(--p-content-hover-background);
  stroke: var(--border-color);
  stroke-width: 2;
}

.valve__flow {
  stroke: var(--tile-color);
  stroke-width: 10;
  stroke-linecap: round;
  stroke-dasharray: 14 10;
  opacity: 0;
  transition: opacity 0.4s ease;
}

.valve--flowing .valve__flow {
  opacity: 0.8;
  animation: valve-flow 0.8s linear infinite;
}

.valve__body {
  fill: color-mix(in srgb, var(--text-color) 70%, var(--p-content-background));
}

.valve__stem {
  fill: color-mix(in srgb, var(--text-color) 50%, var(--p-content-background));
}

.valve__lever {
  transform-origin: 100px 38px;
  transition: transform 0.5s cubic-bezier(0.34, 1.2, 0.64, 1);
}

.valve__handle {
  fill: var(--tile-color);
}

.valve__hub {
  fill: color-mix(in srgb, var(--text-color) 80%, var(--p-content-background));
}

@keyframes valve-flow {
  to {
    stroke-dashoffset: -24;
  }
}

@media (prefers-reduced-motion: reduce) {
  .valve--flowing .valve__flow {
    animation: none;
  }
}
</style>
