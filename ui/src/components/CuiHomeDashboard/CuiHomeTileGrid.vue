<template>
  <div class="home-tile-grid">
    <CuiSensorTile v-for="sensor in sensors" :key="sensor.id" :sensor size="small" :disabled />
  </div>
</template>

<script setup lang="ts">
import CuiSensorTile from '@/components/CuiSensorTile/CuiSensorTile.vue';

import type { CuiHomeTileGridProps } from './types.js';

defineProps<CuiHomeTileGridProps>();
</script>

<style scoped>
.home-tile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0.625rem;
}
</style>
