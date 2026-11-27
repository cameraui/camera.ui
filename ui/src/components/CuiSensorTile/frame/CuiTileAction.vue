<template>
  <button
    type="button"
    class="cui-tile tile-action"
    :class="{ 'tile-action--active': active, 'tile-action--toned': color, 'tile-action--static': !interactive, 'tile-action--labeled': showLabel }"
    :style="color ? { '--tile-color': color } : undefined"
    :aria-label="showLabel ? undefined : label"
    :aria-pressed="interactive && active !== undefined ? active : undefined"
    @click="interactive && emit('click', $event)"
  >
    <span v-if="progress !== undefined" class="tile-action__fill" :style="{ transform: `scaleX(${progress})` }" />
    <span v-if="icon" class="tile-action__glyph cui-wait-ring" :class="{ 'cui-wait-ring--on': waiting, 'cui-wait-ring--failed': failed }">
      <component :is="icon" class="tile-action__icon" />
    </span>
    <span v-if="showLabel" class="tile-action__label">{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
import type { CuiTileActionEmits, CuiTileActionProps } from './types.js';

withDefaults(defineProps<CuiTileActionProps>(), {
  interactive: true,
  active: undefined,
});

const emit = defineEmits<CuiTileActionEmits>();
</script>

<style scoped>
.tile-action {
  position: relative;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  flex: 1 1 0;
  min-width: 0;
  height: 3rem;
  padding: 0 0.875rem;
  border-radius: 1rem;
  background: var(--p-content-hover-background);
  color: var(--text-color);
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    transform 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.tile-action:active:not(.tile-action--static) {
  transform: scale(0.96);
}

.tile-action:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.tile-action:not(.tile-action--labeled) {
  padding: 0;
}

.tile-action--labeled {
  flex: 0 1 auto;
  border-radius: 9999px;
}

.tile-action--active {
  background: var(--text-color);
  color: var(--p-content-background);
}

.tile-action--toned.tile-action--active {
  background: color-mix(in srgb, var(--tile-ink) 18%, var(--p-content-background));
  color: var(--tile-ink);
}

.tile-action--static {
  cursor: default;
}

.tile-action__fill {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--tile-ink) 35%, transparent);
  transform-origin: left;
  pointer-events: none;
}

.tile-action__glyph {
  display: flex;
  flex-shrink: 0;
}

.tile-action__icon {
  position: relative;
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
}

.tile-action__label {
  position: relative;
  font-size: 0.9375rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
