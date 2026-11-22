<template>
  <span class="flow-line" :class="{ 'flow-line--flowing': flowing }" aria-hidden="true" />
</template>

<script setup lang="ts">
import type { CuiFlowLineProps } from './types.js';

defineProps<CuiFlowLineProps>();
</script>

<style scoped>
.flow-line {
  display: block;
  height: 3px;
  border-radius: 999px;
  background: repeating-linear-gradient(90deg, var(--border-color) 0 6px, transparent 6px 12px);
}

.flow-line--flowing {
  background: repeating-linear-gradient(90deg, var(--tile-ink) 0 10px, color-mix(in srgb, var(--tile-ink) 25%, transparent) 10px 20px);
  background-size: 20px 100%;
  animation: flow-line 0.9s linear infinite;
}

@keyframes flow-line {
  to {
    background-position-x: 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .flow-line--flowing {
    animation: none;
  }
}
</style>
