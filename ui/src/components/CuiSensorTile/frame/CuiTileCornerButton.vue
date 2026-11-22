<template>
  <button type="button" class="tile-corner" :aria-label="label">
    <slot />
  </button>
</template>

<script setup lang="ts">
import type { CuiTileCornerButtonProps } from './types.js';

defineProps<CuiTileCornerButtonProps>();
</script>

<style scoped>
.tile-corner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  font-size: 1rem;
  color: var(--text-secondary-color);
  background-color: var(--p-content-hover-background);
  border: 2px solid var(--p-content-background);
  box-shadow: 0 0 0 1px var(--border-color);
  cursor: pointer;
  transition:
    opacity 0.25s ease,
    transform 0.15s ease,
    background-color 0.15s ease,
    box-shadow 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.tile-corner::before {
  content: '';
  position: absolute;
  inset: -0.5rem;
}

.tile-corner:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--text-color) 14%, var(--p-content-background));
  box-shadow: 0 0 0 1px var(--text-muted-color);
}

.tile-corner :slotted(svg) {
  width: 1rem;
  height: 1rem;
}

.tile-corner:active:not(:disabled) {
  transform: scale(0.9);
}

.tile-corner:disabled {
  cursor: default;
}
</style>
