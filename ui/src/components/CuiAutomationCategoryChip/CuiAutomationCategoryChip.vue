<template>
  <span v-if="category" class="cui-category-chip">
    <component :is="meta.icon" class="cui-category-chip-icon" />
    <span class="cui-category-chip-label">{{ $t(meta.labelKey) }}</span>
  </span>
</template>

<script setup lang="ts">
import { getAutomationCategoryMeta } from './types.js';

import type { CuiAutomationCategoryChipProps } from './types.js';

const props = defineProps<CuiAutomationCategoryChipProps>();

const meta = computed(() => getAutomationCategoryMeta(props.category));
</script>

<style scoped>
.cui-category-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  color: var(--text-color);
  background: var(--card-background);
  border: 1px solid var(--border-color-inner);
}

.cui-category-chip-icon {
  width: 0.85rem;
  height: 0.85rem;
  flex-shrink: 0;
  color: var(--text-primary-color);
}
</style>
