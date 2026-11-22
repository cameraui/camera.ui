<template>
  <svg class="battery" :class="{ 'battery--charging': charging }" viewBox="0 0 160 160" aria-hidden="true">
    <rect x="18" y="48" width="112" height="64" rx="14" class="battery__case" />
    <rect x="132" y="68" width="10" height="24" rx="4" class="battery__case" />
    <rect x="27" y="57" width="94" height="46" rx="7" class="battery__level" :style="{ transform: `scaleX(${Math.max(ratio, 0.04)})` }" />
    <path d="M80 60 L64 84 H77 L72 100 L92 74 H79 Z" class="battery__bolt" />
  </svg>
</template>

<script setup lang="ts">
import type { CuiBatterySceneProps } from './types.js';

defineProps<CuiBatterySceneProps>();
</script>

<style scoped>
.battery {
  width: min(100%, 10rem);
  aspect-ratio: 1;
}

.battery__case {
  fill: var(--p-content-hover-background);
  stroke: var(--border-color);
  stroke-width: 2;
}

.battery__level {
  fill: var(--tile-color);
  transform-box: fill-box;
  transform-origin: left center;
  transition:
    transform 0.5s ease,
    fill 0.4s ease;
}

.battery__bolt {
  fill: var(--text-color);
  stroke: var(--p-content-background);
  stroke-width: 2;
  stroke-linejoin: round;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.battery--charging .battery__bolt {
  opacity: 1;
  animation: battery-pulse 2s ease-in-out infinite alternate;
}

@keyframes battery-pulse {
  to {
    opacity: 0.45;
  }
}

@media (prefers-reduced-motion: reduce) {
  .battery--charging .battery__bolt {
    animation: none;
  }
}
</style>
