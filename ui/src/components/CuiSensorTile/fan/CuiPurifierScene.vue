<template>
  <svg class="purifier-scene" :class="{ 'purifier-scene--on': lit }" viewBox="0 0 160 160" aria-hidden="true">
    <g class="purifier-scene__air">
      <circle v-for="dot in dots" :key="dot.key" :cx="dot.x" :cy="dot.y" :r="dot.r" :style="{ opacity: dot.opacity }" />
    </g>
    <rect x="48" y="44" width="64" height="104" rx="18" class="purifier-scene__body" />
    <rect x="58" y="51" width="44" height="7" rx="3.5" class="purifier-scene__vent" />
    <circle cx="80" cy="76" r="4" class="purifier-scene__led" />
    <line v-for="y in GRILLE" :key="y" x1="62" :y1="y" x2="98" :y2="y" class="purifier-scene__grille" />
  </svg>
</template>

<script setup lang="ts">
import { useEasedPhase } from '../useEasedPhase.js';

import type { CuiPurifierSceneProps } from './types.js';

const GRILLE = [94, 102, 110, 118, 126, 134];
const DOT_COUNT = 7;
const RISE = 36;

const props = defineProps<CuiPurifierSceneProps>();

const phase = useEasedPhase(() => (props.working ? 0.2 + props.ratio * 0.5 : 0));

const dots = computed(() =>
  Array.from({ length: DOT_COUNT }, (_, index) => {
    const progress = (phase.value + index / DOT_COUNT) % 1;
    return {
      key: index,
      x: 62 + ((index * 23) % 37) + Math.sin((progress + index) * 2 * Math.PI) * 3,
      y: 42 - progress * RISE,
      r: 3 - progress * 1.5,
      opacity: Math.sin(progress * Math.PI) * 0.8,
    };
  }),
);
</script>

<style scoped>
.purifier-scene {
  width: min(100%, 11rem);
  aspect-ratio: 1;
}

.purifier-scene__air {
  fill: var(--tile-color);
  opacity: 0;
  transition: opacity 0.4s ease;
}

.purifier-scene--on .purifier-scene__air {
  opacity: 1;
}

.purifier-scene__body {
  fill: var(--p-content-hover-background);
  stroke: var(--border-color);
  stroke-width: 2;
}

.purifier-scene__vent,
.purifier-scene__led {
  fill: color-mix(in srgb, var(--text-color) 30%, var(--p-content-background));
  transition: fill 0.3s ease;
}

.purifier-scene--on .purifier-scene__led {
  fill: var(--tile-color);
}

.purifier-scene__grille {
  stroke: color-mix(in srgb, var(--text-color) 25%, var(--p-content-background));
  stroke-width: 3;
  stroke-linecap: round;
}
</style>
