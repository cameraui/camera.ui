<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-for="color in colorOptions"
      :key="color.value"
      v-tooltip.top="{ value: color.label }"
      class="vehicle-color"
      :class="{ 'vehicle-color-active': colors.includes(color.value) }"
      :style="{ background: color.swatch }"
      :aria-label="color.label"
      :aria-pressed="colors.includes(color.value)"
      @click="toggleColor(color.value)"
    />
  </div>
</template>

<script setup lang="ts">
import { VEHICLE_COLORS } from '@camera.ui/nvr';

import { vehicleColorKey } from '@/common/eventLabels.js';
import { toggled, VEHICLE_SWATCHES } from './filters.js';

const colors = defineModel<string[]>({ required: true });

const { t } = useI18n();

const colorOptions = computed(() => VEHICLE_COLORS.map((color) => ({ label: t(vehicleColorKey(color)), value: color as string, swatch: VEHICLE_SWATCHES[color] })));

function toggleColor(color: string): void {
  colors.value = toggled(colors.value, color);
}
</script>

<style scoped>
.vehicle-color {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: outline-color 150ms ease;
  outline: 2px solid transparent;
  outline-offset: 2px;
}

.vehicle-color-active {
  outline-color: var(--p-primary-color);
}
</style>
