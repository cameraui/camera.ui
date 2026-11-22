<template>
  <svg class="vibration" :class="{ 'vibration--active': active }" viewBox="0 0 160 160" aria-hidden="true">
    <g class="vibration__waves">
      <path d="M38 58 q-10 22 0 44" />
      <path d="M26 48 q-16 32 0 64" />
      <path d="M122 58 q10 22 0 44" />
      <path d="M134 48 q16 32 0 64" />
    </g>
    <g class="vibration__device">
      <rect x="52" y="34" width="56" height="92" rx="10" class="vibration__body" />
      <circle cx="80" cy="88" r="17" class="vibration__drum" />
      <line x1="60" y1="48" x2="78" y2="48" class="vibration__panel" />
    </g>
  </svg>
</template>

<script setup lang="ts">
import type { CuiBinarySceneProps } from './types.js';

defineProps<CuiBinarySceneProps>();
</script>

<style scoped>
.vibration {
  width: min(100%, 10rem);
  aspect-ratio: 1;
}

.vibration__body {
  fill: var(--p-content-hover-background);
  stroke: var(--border-color);
  stroke-width: 2;
}

.vibration__drum {
  fill: color-mix(in srgb, var(--text-color) 15%, var(--p-content-background));
  stroke: var(--border-color);
  stroke-width: 2;
}

.vibration__panel {
  stroke: var(--text-secondary-color);
  stroke-width: 3;
  stroke-linecap: round;
}

.vibration__waves {
  fill: none;
  stroke: var(--tile-color);
  stroke-width: 3;
  stroke-linecap: round;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.vibration--active .vibration__waves {
  opacity: 1;
  animation: vibration-fade 1s ease-in-out infinite alternate;
}

.vibration--active .vibration__device {
  animation: vibration-shake 0.18s linear infinite;
}

@keyframes vibration-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-1.5px);
  }
  75% {
    transform: translateX(1.5px);
  }
}

@keyframes vibration-fade {
  to {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  .vibration--active .vibration__waves,
  .vibration--active .vibration__device {
    animation: none;
  }
}
</style>
