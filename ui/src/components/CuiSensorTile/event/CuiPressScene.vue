<template>
  <div class="press-scene">
    <div :key="stamp" class="press-scene__cap" :class="press && `press-scene__cap--${press}`" />
  </div>
</template>

<script setup lang="ts">
import type { CuiPressSceneProps } from './types.js';

defineProps<CuiPressSceneProps>();
</script>

<style scoped>
.press-scene {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 8rem;
  height: 8rem;
  border-radius: 50%;
  background: var(--p-content-hover-background);
  border: 1px solid var(--border-color);
}

.press-scene__cap {
  width: 5.5rem;
  height: 5.5rem;
  border-radius: 50%;
  background: color-mix(in srgb, var(--tile-color) 35%, var(--p-content-background));
  box-shadow:
    0 6px 0 color-mix(in srgb, var(--tile-color) 55%, var(--p-content-background)),
    0 8px 14px rgb(0 0 0 / 0.2);
}

.press-scene__cap--single {
  animation: press-sink 0.35s ease-in-out;
}

.press-scene__cap--double {
  animation: press-sink 0.3s ease-in-out 2;
}

.press-scene__cap--long {
  animation: press-hold 1.2s ease-in-out;
}

@keyframes press-sink {
  50% {
    transform: translateY(5px);
    box-shadow:
      0 1px 0 color-mix(in srgb, var(--tile-color) 55%, var(--p-content-background)),
      0 2px 4px rgb(0 0 0 / 0.2);
    background: var(--tile-color);
  }
}

@keyframes press-hold {
  15%,
  85% {
    transform: translateY(5px);
    box-shadow:
      0 1px 0 color-mix(in srgb, var(--tile-color) 55%, var(--p-content-background)),
      0 2px 4px rgb(0 0 0 / 0.2);
    background: var(--tile-color);
  }
}

@media (prefers-reduced-motion: reduce) {
  .press-scene__cap {
    animation: none;
  }
}
</style>
