<template>
  <svg class="garage-scene" :class="{ 'garage-scene--moving': moving }" viewBox="0 0 200 170" aria-hidden="true">
    <defs>
      <clipPath :id="clipId">
        <rect :x="DX" :y="DY" :width="DW" :height="DH" />
      </clipPath>
    </defs>

    <polygon points="8,72 100,10 192,72" class="garage-scene__roof" />
    <rect x="22" y="66" width="156" height="98" class="garage-scene__wall" />
    <rect :x="DX" :y="DY" :width="DW" :height="DH" class="garage-scene__inside" />

    <g :clip-path="`url(#${clipId})`">
      <g class="garage-scene__door" :style="{ transform: `translateY(${-openRatio * (DH - 6)}px)` }">
        <rect v-for="index in PANELS" :key="index" :x="DX" :y="DY + (index - 1) * PANEL" :width="DW" :height="PANEL - 1.5" rx="1.5" class="garage-scene__panel" />
        <rect :x="DX + DW / 2 - 9" :y="DY + DH - 12" width="18" height="3" rx="1.5" class="garage-scene__handle" />
      </g>
    </g>

    <rect v-if="obstructed" :x="DX" :y="DY + DH - 5" :width="DW" height="5" rx="2" class="garage-scene__obstruction" />
    <line x1="14" y1="164" x2="186" y2="164" class="garage-scene__ground" />
  </svg>
</template>

<script setup lang="ts">
import type { CuiGarageSceneProps } from './types.js';

defineProps<CuiGarageSceneProps>();

const clipId = useId();

const DX = 42;
const DY = 86;
const DW = 116;
const DH = 78;
const PANELS = 4;
const PANEL = DH / PANELS;
</script>

<style scoped>
.garage-scene {
  width: min(100%, 14rem);
  aspect-ratio: 200 / 170;
}

.garage-scene__roof {
  fill: color-mix(in srgb, var(--text-color) 30%, var(--p-content-background));
}

.garage-scene__wall {
  fill: var(--p-content-hover-background);
  stroke: var(--border-color);
  stroke-width: 1.5;
}

.garage-scene__inside {
  fill: color-mix(in srgb, var(--text-color) 55%, var(--p-content-background));
}

.garage-scene__panel {
  fill: color-mix(in srgb, var(--text-color) 18%, var(--p-content-background));
  stroke: color-mix(in srgb, var(--text-color) 30%, var(--p-content-background));
  stroke-width: 1;
}

.garage-scene__handle {
  fill: color-mix(in srgb, var(--text-color) 50%, var(--p-content-background));
}

.garage-scene__door {
  transition: transform 0.5s ease;
}

.garage-scene--moving .garage-scene__door {
  transition-duration: 4s;
  transition-timing-function: linear;
}

.garage-scene__ground {
  stroke: var(--border-color);
  stroke-width: 2;
  stroke-linecap: round;
}

.garage-scene__obstruction {
  fill: rgb(239 68 68);
}
</style>
