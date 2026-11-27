<template>
  <button
    type="button"
    class="cui-tile tile-button"
    :class="{ 'tile-button--active': active, 'tile-button--static': !interactive, 'tile-button--hero': hero }"
    :style="color ? { '--tile-color': color } : undefined"
    :aria-label="label"
    :aria-pressed="interactive ? active : undefined"
    @click="interactive && emit('click')"
  >
    <component :is="icon" class="tile-button__icon" />
  </button>
</template>

<script setup lang="ts">
import type { CuiTileButtonEmits, CuiTileButtonProps } from './types.js';

withDefaults(defineProps<CuiTileButtonProps>(), {
  interactive: true,
});

const emit = defineEmits<CuiTileButtonEmits>();
</script>

<style scoped>
.tile-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  background: var(--p-content-background);
  border: 1px solid var(--border-color);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  transition:
    background 0.25s ease,
    box-shadow 0.25s ease,
    transform 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.tile-button:active:not(.tile-button--static) {
  transform: scale(0.92);
}

.tile-button--active {
  background: color-mix(in srgb, var(--tile-ink) 18%, var(--p-content-background));
}

.tile-button--hero {
  width: 6rem;
  height: 6rem;
}

.tile-button--hero .tile-button__icon {
  width: 2.5rem;
  height: 2.5rem;
}

.tile-button--static {
  cursor: default;
}

.tile-button__icon {
  width: 1.375rem;
  height: 1.375rem;
  color: var(--text-secondary-color);
  transition: color 0.25s ease;
}

.tile-button--active .tile-button__icon {
  color: var(--tile-ink);
}
</style>
