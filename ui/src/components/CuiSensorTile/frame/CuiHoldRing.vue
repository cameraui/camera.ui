<template>
  <svg class="hold-ring" :class="{ 'hold-ring--active': active }" viewBox="0 0 120 120" aria-hidden="true">
    <circle cx="60" cy="60" r="56" class="hold-ring__track" />
    <circle v-if="holding" cx="60" cy="60" r="56" pathLength="100" class="hold-ring__arc hold-ring__hold" :stroke-dasharray="`${progress * 100} 100`" />
    <circle v-else-if="spinning" cx="60" cy="60" r="56" pathLength="100" class="hold-ring__arc hold-ring__spin" stroke-dasharray="18 82" />
  </svg>
</template>

<script setup lang="ts">
import type { CuiHoldRingProps } from './types.js';

withDefaults(defineProps<CuiHoldRingProps>(), {
  progress: 0,
});
</script>

<style scoped>
.hold-ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.hold-ring circle {
  fill: none;
  stroke-width: 4;
}

.hold-ring__track {
  stroke: var(--border-color);
  transition: stroke 0.3s ease;
}

.hold-ring--active .hold-ring__track {
  stroke: var(--tile-ink);
}

.hold-ring__arc {
  stroke: var(--tile-ink);
  stroke-linecap: round;
  transform: rotate(-90deg);
  transform-origin: 60px 60px;
}

/* holding on an active ring takes the color away, on an idle one it fills it */
.hold-ring--active .hold-ring__hold {
  stroke: var(--text-secondary-color);
}

.hold-ring__spin {
  animation: hold-ring-spin 1.1s linear infinite;
}

@keyframes hold-ring-spin {
  to {
    transform: rotate(270deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hold-ring__spin {
    animation: none;
  }
}
</style>
