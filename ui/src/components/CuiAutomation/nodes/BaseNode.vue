<template>
  <div
    class="automation-node card-background rounded-lg border-2 shadow-lg min-w-[180px] max-w-[220px] select-none"
    :class="{ 'ring-2 ring-primary': selected }"
    :style="{ borderColor: color }"
  >
    <div class="flex items-center gap-2 px-3 py-2.5">
      <div class="flex items-center justify-center w-8 h-8 rounded-md shrink-0" :style="{ backgroundColor: `${color}20`, color }">
        <component :is="icon" class="w-4.5 h-4.5" />
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-xs font-semibold truncate text-color">{{ label }}</div>
        <div v-if="subtitle" class="text-[10px] text-muted truncate mt-0.5">{{ subtitle }}</div>
      </div>
    </div>

    <Handle v-if="showInput" type="target" :position="Position.Top" :connectable="maxInputs" class="!w-3 !h-3 !border-2" :style="handleStyle" />

    <slot name="handles">
      <Handle v-if="showOutput" type="source" :position="Position.Bottom" class="!w-3 !h-3 !border-2" :style="handleStyle" />
    </slot>
  </div>
</template>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';

import { BASE_NODE_DEFAULTS } from './types.js';

import type { BaseNodeProps } from './types.js';

withDefaults(defineProps<BaseNodeProps>(), BASE_NODE_DEFAULTS);

const handleStyle = {
  backgroundColor: 'var(--text-muted-color)',
  borderColor: 'var(--card-background)',
};
</script>

<style scoped>
.automation-node {
  transition:
    box-shadow 0.15s ease,
    border-color 0.15s ease;
}

.automation-node:hover {
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.15),
    0 0 0 1px var(--border-color);
}
</style>
