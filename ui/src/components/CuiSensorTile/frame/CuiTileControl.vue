<template>
  <div class="tile-control">
    <slot />
    <span class="tile-control__caption">{{ caption }}</span>
  </div>
</template>

<script setup lang="ts">
import type { CuiTileControlProps } from './types.js';

defineProps<CuiTileControlProps>();
</script>

<style scoped>
.tile-control {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  width: 4.5rem;
}

.tile-control__caption {
  font-size: 0.75rem;
  color: var(--text-secondary-color);
  text-align: center;
  line-height: 1.2;
}
</style>
