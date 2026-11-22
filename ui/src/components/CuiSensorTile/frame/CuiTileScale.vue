<template>
  <div class="tile-scale" :class="{ 'tile-scale--thin': thin }">
    <div class="tile-scale__track" :style="{ background: track }" />
    <span v-if="ratio !== undefined" class="tile-scale__marker" :style="{ left: `${clampRatio(ratio) * 100}%`, background: color ?? 'var(--text-color)' }" />
  </div>
</template>

<script setup lang="ts">
import { clampRatio } from '../range.js';

import type { CuiTileScaleProps } from './types.js';

const props = defineProps<CuiTileScaleProps>();

const track = computed(() => {
  if (props.gradient) return `linear-gradient(90deg, ${tint(props.gradient[0])}, ${tint(props.gradient[1])})`;
  if (!props.zones?.length) return 'var(--p-content-hover-background)';
  let from = 0;
  const stops = props.zones.map(({ to, color }) => {
    const stop = `${tint(color)} ${from * 100}% ${to * 100}%`;
    from = to;
    return stop;
  });
  return `linear-gradient(90deg, ${stops.join(', ')})`;
});

function tint(color: string): string {
  return `color-mix(in srgb, ${color} 45%, var(--p-content-background))`;
}
</script>

<style scoped>
.tile-scale {
  position: relative;
  height: 0.625rem;
  display: flex;
  align-items: center;
}

.tile-scale__track {
  width: 100%;
  height: 0.25rem;
  border-radius: 999px;
}

.tile-scale__marker {
  position: absolute;
  top: 50%;
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--p-content-background);
  transform: translate(-50%, -50%);
  transition:
    left 0.4s ease,
    background 0.3s ease;
}

.tile-scale--thin {
  height: 0.375rem;
}

.tile-scale--thin .tile-scale__track {
  height: 0.125rem;
}

.tile-scale--thin .tile-scale__marker {
  width: 0.375rem;
  height: 0.375rem;
  box-shadow: 0 0 0 1.5px var(--p-content-background);
}
</style>
