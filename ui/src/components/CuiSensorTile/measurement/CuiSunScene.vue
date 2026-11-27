<template>
  <svg class="sun" :class="{ 'sun--dark': dark }" viewBox="0 0 160 160" aria-hidden="true">
    <defs>
      <mask :id="maskId">
        <rect width="160" height="160" fill="white" />
        <circle cx="94" cy="70" r="22" fill="black" />
      </mask>
    </defs>

    <g class="sun__day">
      <g class="sun__rays" :style="{ opacity: 0.45 + ratio * 0.55 }">
        <g v-for="angle in RAYS" :key="angle" :transform="`rotate(${angle} 80 80)`">
          <rect x="78" y="22" width="4" height="22" rx="2" class="sun__ray" :style="{ transform: `scaleY(${0.3 + ratio * 0.7})` }" />
        </g>
      </g>
      <circle cx="80" cy="80" r="22" class="sun__disc" />
    </g>

    <g class="sun__night">
      <circle cx="80" cy="80" r="26" :mask="`url(#${maskId})`" class="sun__moon" />
      <circle v-for="star in STARS" :key="star.x" :cx="star.x" :cy="star.y" :r="star.r" class="sun__star" />
    </g>
  </svg>
</template>

<script setup lang="ts">
import type { CuiSunSceneProps } from './types.js';

defineProps<CuiSunSceneProps>();

const maskId = useId();

const RAYS = Array.from({ length: 12 }, (_, index) => index * 30);
const STARS = [
  { x: 118, y: 46, r: 2.5 },
  { x: 128, y: 74, r: 1.5 },
  { x: 108, y: 112, r: 2 },
];
</script>

<style scoped>
.sun {
  width: min(100%, 10rem);
  aspect-ratio: 1;
}

.sun__day,
.sun__night {
  transition: opacity 0.5s ease;
}

.sun__night,
.sun--dark .sun__day {
  opacity: 0;
}

.sun--dark .sun__night {
  opacity: 1;
}

.sun__rays {
  transform-box: view-box;
  transform-origin: 80px 80px;
  animation: sun-turn 60s linear infinite;
  transition: opacity 0.5s ease;
}

.sun__ray {
  fill: var(--tile-color);
  transform-box: fill-box;
  transform-origin: center bottom;
  transition: transform 0.5s ease;
}

.sun__disc {
  fill: var(--tile-color);
}

.sun__moon,
.sun__star {
  fill: color-mix(in srgb, var(--text-color) 45%, var(--p-content-background));
}

@keyframes sun-turn {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sun__rays {
    animation: none;
  }
}
</style>
