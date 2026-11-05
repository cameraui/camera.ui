<template>
  <label class="flex items-center cursor-pointer" :class="plain ? 'gap-2 text-sm' : 'cui-toggle-switch gap-3'">
    <Checkbox v-model="checked" binary />
    <component :is="icon" v-if="icon" class="w-4 h-4 shrink-0 text-muted" />
    <span :class="{ 'cui-label-switch': !plain }">{{ label }}</span>
  </label>
</template>

<script setup lang="ts">
import type { CuiCheckRowProps } from './types.js';

defineProps<CuiCheckRowProps>();

const checked = defineModel<boolean>({ required: true });
</script>
