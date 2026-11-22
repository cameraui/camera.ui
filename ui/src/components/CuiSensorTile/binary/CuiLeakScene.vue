<template>
  <svg class="leak" :class="{ 'leak--wet': active }" viewBox="0 0 160 160" aria-hidden="true">
    <rect x="20" y="22" width="120" height="14" rx="4" class="leak__pipe" />
    <rect x="70" y="18" width="20" height="22" rx="3" class="leak__joint" />
    <path v-for="(drop, index) in DROPS" :key="index" :d="dropPath(drop)" class="leak__drop" :style="{ animationDelay: `${index * 0.7}s` }" />
    <ellipse cx="80" cy="132" rx="56" ry="9" class="leak__puddle" />
    <line x1="12" y1="142" x2="148" y2="142" class="leak__floor" />
  </svg>
</template>

<script setup lang="ts">
import type { CuiBinarySceneProps } from './types.js';

const DROPS = [76, 84];

defineProps<CuiBinarySceneProps>();

function dropPath(x: number): string {
  return `M${x} 44 C${x} 44 ${x - 5} 52 ${x - 5} 55 a5 5 0 0 0 10 0 C${x + 5} 52 ${x} 44 ${x} 44 Z`;
}
</script>

<style scoped>
.leak {
  width: min(100%, 10rem);
  aspect-ratio: 1;
}

.leak__pipe,
.leak__joint {
  fill: var(--p-content-hover-background);
  stroke: var(--border-color);
  stroke-width: 2;
}

.leak__drop {
  fill: var(--tile-color);
  opacity: 0;
}

.leak--wet .leak__drop {
  animation: leak-drip 1.4s ease-in infinite;
}

.leak__puddle {
  fill: color-mix(in srgb, var(--tile-color) 55%, var(--p-content-background));
  transform-box: fill-box;
  transform-origin: center;
  transform: scale(0.08, 0.3);
  opacity: 0;
  transition:
    transform 1.2s ease,
    opacity 0.6s ease;
}

.leak--wet .leak__puddle {
  transform: scale(1);
  opacity: 1;
}

.leak__floor {
  stroke: var(--border-color);
  stroke-width: 2;
  stroke-linecap: round;
}

@keyframes leak-drip {
  0% {
    opacity: 0;
    transform: translateY(0);
  }
  15% {
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(72px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .leak--wet .leak__drop {
    animation: none;
    opacity: 1;
  }
}
</style>
