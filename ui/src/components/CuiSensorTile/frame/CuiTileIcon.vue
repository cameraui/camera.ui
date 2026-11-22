<template>
  <span class="tile-icon" :class="{ 'tile-icon--active': active }">
    <component :is="icon" class="tile-icon__svg" />
    <span v-if="badge" v-tooltip.top="badgeLabel" class="tile-icon__badge" role="img" :aria-label="badgeLabel">
      <component :is="badge" />
    </span>
  </span>
</template>

<script setup lang="ts">
import type { CuiTileIconProps } from './types.js';

defineProps<CuiTileIconProps>();
</script>

<style scoped>
.tile-icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: var(--p-content-hover-background);
  color: var(--text-secondary-color);
  transition:
    background 0.25s ease,
    color 0.25s ease,
    box-shadow 0.25s ease;
}

.tile-icon--active {
  background: color-mix(in srgb, var(--tile-ink) 24%, var(--p-content-background));
  color: var(--tile-ink);
  box-shadow: 0 0 16px color-mix(in srgb, var(--tile-ink) 40%, transparent);
}

.tile-icon__svg {
  width: 1.375rem;
  height: 1.375rem;
}

.tile-icon__badge {
  position: absolute;
  right: -0.25rem;
  bottom: -0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 50%;
  background: var(--p-content-background);
  box-shadow: 0 0 0 1px var(--border-color);
  color: var(--text-color);
}

.tile-icon__badge svg {
  width: 0.6875rem;
  height: 0.6875rem;
}
</style>
