<template>
  <span class="ai-badge" :class="isInline ? '' : `absolute z-[4] ${positionClass}`">
    <i-tabler:sparkles class="w-3 h-3 text-white drop-shadow" />
  </span>
</template>

<script lang="ts" setup>
import { AI_BADGE_DEFAULTS } from './types.js';

import type { AiBadgeProps } from './types.js';

const props = withDefaults(defineProps<AiBadgeProps>(), AI_BADGE_DEFAULTS);

const positionClasses: Record<string, string> = {
  'top-right': 'top-1.5 right-1.5',
  'top-left': 'top-1.5 left-1.5',
  'bottom-right': 'bottom-1.5 right-1.5',
  'bottom-left': 'bottom-1.5 left-1.5',
};

const isInline = computed(() => props.position === 'inline');
const positionClass = computed(() => positionClasses[props.position] ?? '');
</script>

<style scoped>
.ai-badge {
  padding: 4px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  flex-shrink: 0;
}
</style>
