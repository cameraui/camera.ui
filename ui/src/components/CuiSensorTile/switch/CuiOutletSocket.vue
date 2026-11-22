<template>
  <svg
    class="cui-tile outlet-socket"
    :class="{ 'outlet-socket--on': on, 'outlet-socket--in-use': inUse }"
    :style="color ? { '--tile-color': color } : undefined"
    viewBox="0 0 100 100"
    aria-hidden="true"
  >
    <rect x="4" y="4" width="92" height="92" rx="24" class="outlet-socket__plate" />
    <circle cx="50" cy="50" r="33" class="outlet-socket__ring" />
    <circle cx="36" cy="50" r="5.5" class="outlet-socket__pin" />
    <circle cx="64" cy="50" r="5.5" class="outlet-socket__pin" />
  </svg>
</template>

<script setup lang="ts">
import type { CuiOutletSocketProps } from './types.js';

defineProps<CuiOutletSocketProps>();
</script>

<style scoped>
.outlet-socket {
  flex-shrink: 0;
  width: 6rem;
  height: 6rem;
  overflow: visible;
}

.outlet-socket__plate {
  fill: var(--p-content-hover-background);
  stroke: var(--border-color);
  stroke-width: 1.5;
}

.outlet-socket__ring {
  fill: var(--p-content-background);
  stroke: var(--border-color);
  stroke-width: 2;
  transition:
    stroke 0.3s ease,
    filter 0.3s ease;
}

.outlet-socket__pin {
  fill: var(--text-secondary-color);
  transition: fill 0.3s ease;
}

.outlet-socket--on .outlet-socket__ring {
  stroke: var(--tile-ink);
  stroke-width: 3;
  filter: drop-shadow(0 0 6px color-mix(in srgb, var(--tile-color) 60%, transparent));
}

.outlet-socket--in-use .outlet-socket__pin {
  fill: var(--tile-ink);
}
</style>
