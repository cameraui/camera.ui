<template>
  <svg class="air-quality" viewBox="0 0 160 110" aria-hidden="true">
    <path
      v-for="(segment, index) in segments"
      :key="index"
      :d="segment"
      class="air-quality__segment"
      :class="{ 'air-quality__segment--active': index === level }"
      :style="{ stroke: colors[index] }"
    />
  </svg>
</template>

<script setup lang="ts">
import type { CuiAirQualitySceneProps } from './types.js';

const props = defineProps<CuiAirQualitySceneProps>();

const CENTER_X = 80;
const CENTER_Y = 96;
const RADIUS = 62;
const GAP = 4;

const segments = computed(() => {
  const sweep = (180 - GAP * (props.colors.length - 1)) / props.colors.length;
  return props.colors.map((_, index) => {
    const start = 180 + index * (sweep + GAP);
    return arc(start, start + sweep);
  });
});

function arc(from: number, to: number): string {
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M${x1} ${y1} A${RADIUS} ${RADIUS} 0 0 1 ${x2} ${y2}`;
}

function point(degrees: number): [number, number] {
  const radians = (degrees * Math.PI) / 180;
  return [CENTER_X + RADIUS * Math.cos(radians), CENTER_Y + RADIUS * Math.sin(radians)];
}
</script>

<style scoped>
.air-quality {
  width: min(100%, 11rem);
  aspect-ratio: 160 / 110;
}

.air-quality__segment {
  fill: none;
  stroke-width: 10;
  stroke-linecap: round;
  opacity: 0.25;
  transition:
    opacity 0.4s ease,
    stroke-width 0.4s ease;
}

.air-quality__segment--active {
  stroke-width: 16;
  opacity: 1;
}
</style>
