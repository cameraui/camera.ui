<template>
  <div
    class="hold-dial"
    :class="{ 'hold-dial--active': active, 'hold-dial--interactive': interactive }"
    role="switch"
    :aria-checked="checked"
    :aria-label="label"
    :tabindex="interactive ? 0 : -1"
  >
    <CuiHoldRing :active :holding :progress :spinning />
    <slot />
  </div>
</template>

<script setup lang="ts">
import CuiHoldRing from './CuiHoldRing.vue';

import type { CuiHoldDialProps } from './types.js';

defineProps<CuiHoldDialProps>();
</script>

<style scoped>
.hold-dial {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--p-content-hover-background);
  touch-action: pan-y;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    background 0.3s ease,
    transform 0.15s ease;
}

.hold-dial--interactive {
  cursor: pointer;
}

.hold-dial--interactive:active {
  transform: scale(0.98);
}

.hold-dial:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 3px;
}

.hold-dial--active {
  background: color-mix(in srgb, var(--tile-color) 14%, var(--p-content-background));
}
</style>
