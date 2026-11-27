<template>
  <div class="tile-reading">
    <span class="tile-reading__state">{{ state }}</span>
    <span v-if="detail !== undefined" class="tile-reading__detail">{{ detail }}</span>
  </div>
</template>

<script setup lang="ts">
import type { CuiTileReadingProps } from './types.js';

defineProps<CuiTileReadingProps>();
</script>

<style scoped>
.tile-reading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.125rem;
  text-align: center;
}

.tile-reading__state {
  font-size: 1.375rem;
  font-weight: 600;
  line-height: 1.2;
  color: var(--text-color);
}

.tile-reading__detail {
  min-height: 1lh;
  font-size: 0.8125rem;
  color: var(--text-secondary-color);
}
</style>
