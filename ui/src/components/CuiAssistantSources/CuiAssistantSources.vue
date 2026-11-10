<template>
  <div class="flex flex-wrap gap-1.5">
    <a
      v-for="source in sources"
      :key="source.url"
      :href="source.url"
      target="_blank"
      rel="noopener noreferrer"
      class="cui-assistant-source flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs"
    >
      <i-mdi:web class="w-3.5 h-3.5 shrink-0" />
      <span class="truncate max-w-[16rem]">{{ sourceLabel(source) }}</span>
    </a>
  </div>
</template>

<script setup lang="ts">
import { sourceLabel } from './types.js';

import type { CuiAssistantSourcesProps } from './types.js';

defineProps<CuiAssistantSourcesProps>();
</script>

<style scoped>
.cui-assistant-source {
  background: var(--card-background);
  border: 1px solid var(--border-color-inner);
  color: var(--text-color-faded);
  transition:
    border-color 140ms ease,
    color 140ms ease,
    background 140ms ease;
}

.cui-assistant-source:hover {
  border-color: var(--p-primary-color);
  color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 9%, transparent);
}
</style>
