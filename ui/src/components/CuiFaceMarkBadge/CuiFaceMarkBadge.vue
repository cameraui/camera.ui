<template>
  <span
    v-tooltip.top="text"
    class="rounded-full shadow-md"
    :class="[compact ? 'cui-icon-xs' : 'cui-icon-sm', danger ? 'bg-red-500 text-white' : 'bg-amber-400 text-black']"
  >
    <i-mdi:exclamation-thick width="100%" height="100%" />
  </span>
</template>

<script setup lang="ts">
import type { CuiFaceMarkBadgeProps } from './types.js';

defineProps<CuiFaceMarkBadgeProps>();
</script>
