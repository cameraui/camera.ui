<template>
  <button type="button" class="tile-mini" :aria-label="label">
    <component :is="icon" />
  </button>
</template>

<script setup lang="ts">
import type { CuiTileMiniButtonProps } from './types.js';

defineProps<CuiTileMiniButtonProps>();
</script>

<style scoped>
.tile-mini {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  font-size: 1.25rem;
  color: var(--text-color);
  cursor: pointer;
  transition:
    background 0.15s ease,
    transform 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.tile-mini:hover:not(:disabled) {
  background: var(--p-content-hover-background);
}

.tile-mini:active:not(:disabled) {
  transform: scale(0.9);
}

.tile-mini:disabled {
  cursor: default;
  opacity: 0.5;
}
</style>
