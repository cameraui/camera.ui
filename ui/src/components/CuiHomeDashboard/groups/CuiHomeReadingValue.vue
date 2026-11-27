<template>
  <span class="cui-tile home-reading-value" :class="{ 'home-reading-value--toned': value.color }" :style="value.color ? { '--tile-color': value.color } : undefined">
    {{ short ? value.short : value.text }}
  </span>
</template>

<script setup lang="ts">
import type { CuiHomeReadingValueProps } from './readings.js';

defineProps<CuiHomeReadingValueProps>();
</script>

<style scoped>
.home-reading-value {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.home-reading-value.home-reading-value--toned {
  color: var(--tile-ink);
}
</style>
