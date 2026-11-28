<template>
  <div class="flex flex-1 min-h-0 flex-col items-center justify-center w-full gap-4 py-16">
    <div class="cui-empty-state__icon w-16 h-16 rounded-full bg-primary-500/10 flex items-center justify-center text-primary-500">
      <slot name="icon" />
    </div>
    <div class="flex flex-col items-center gap-1 max-w-[400px] px-4 text-center">
      <span class="text-color font-semibold text-base">{{ title }}</span>
      <span v-if="hint" class="text-muted text-sm">{{ hint }}</span>
    </div>
    <div v-if="$slots.default" class="flex items-center gap-2 mt-2 empty:hidden">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CuiEmptyStateProps } from './types.js';

defineProps<CuiEmptyStateProps>();
</script>

<style scoped>
.cui-empty-state__icon :slotted(svg) {
  width: 2rem;
  height: 2rem;
}
</style>
