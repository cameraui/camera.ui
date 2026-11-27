<template>
  <button type="button" class="home-value-cell" :class="{ 'home-value-cell--big': big }">
    <span class="home-value-cell__name">{{ name }}</span>
    <span class="home-value-cell__value">{{ value }}</span>
    <span class="home-value-cell__detail"><slot /></span>
  </button>
</template>

<script setup lang="ts">
import type { CuiHomeValueCellProps } from './places.js';

defineProps<CuiHomeValueCellProps>();
</script>

<style scoped>
.home-value-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0.125rem;
  width: 100%;
  min-width: 0;
  height: 4.875rem;
  padding: 0.5rem 0.625rem;
  border-radius: 1rem;
  background: var(--p-content-hover-background);
  color: var(--text-color);
  text-align: left;
  cursor: pointer;
}

.home-value-cell:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.home-value-cell--big {
  height: 5.75rem;
  padding: 0.625rem 0.75rem;
}

.home-value-cell__name,
.home-value-cell__detail {
  max-width: 100%;
  font-size: 0.75rem;
  line-height: 0.9375rem;
  color: var(--text-secondary-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-value-cell__name {
  font-weight: 500;
}

.home-value-cell__detail {
  min-height: 0.9375rem;
}

.home-value-cell__value {
  max-width: 100%;
  font-size: 1.375rem;
  font-weight: 300;
  line-height: 1.2;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-value-cell--big .home-value-cell__value {
  font-size: 1.875rem;
}
</style>
