<template>
  <div ref="rootRef" class="home-matrix" role="img" :aria-label="label">
    <span
      v-for="item in shown"
      :key="item.key"
      class="cui-tile home-matrix__cell"
      :class="{ 'home-matrix__cell--on': item.on }"
      :style="item.color ? { '--tile-color': item.color } : undefined"
    >
      <component :is="item.icon" class="home-matrix__icon" />
    </span>
    <span v-if="more" class="home-matrix__cell home-matrix__cell--more">+{{ more }}</span>
  </div>
</template>

<script setup lang="ts">
import { MATRIX_GAP, MATRIX_PITCH } from './status.js';

import type { CuiHomeIconMatrixProps } from './status.js';

const props = defineProps<CuiHomeIconMatrixProps>();

const rootRef = useTemplateRef<HTMLDivElement>('rootRef');

const { width } = useElementSize(rootRef);

const capacity = computed(() => Math.max(1, Math.floor((width.value + MATRIX_GAP) / MATRIX_PITCH)) * props.rows);
const shown = computed(() => (props.items.length > capacity.value ? props.items.slice(0, capacity.value - 1) : props.items));
const more = computed(() => props.items.length - shown.value.length);
</script>

<style scoped>
.home-matrix {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-end;
  gap: 0.375rem;
  min-width: 0;
}

.home-matrix__cell {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: var(--p-content-hover-background);
  color: var(--text-secondary-color);
}

.home-matrix__cell--on {
  background: color-mix(in srgb, var(--tile-color) 22%, transparent);
  color: var(--tile-ink);
}

.home-matrix__cell--more {
  width: auto;
  min-width: 1.5rem;
  padding: 0 0.375rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 600;
}

.home-matrix__icon {
  width: 0.875rem;
  height: 0.875rem;
}
</style>
