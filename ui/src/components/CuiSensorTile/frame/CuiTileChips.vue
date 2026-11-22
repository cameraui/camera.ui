<template>
  <div class="flex flex-col gap-2 w-full">
    <span class="text-xs font-medium text-muted">{{ label }}</span>
    <div class="flex flex-wrap gap-2">
      <Button
        v-for="option in options"
        :key="option.value"
        :label="option.label"
        :severity="option.value === selected ? undefined : 'secondary'"
        :outlined="option.value !== selected"
        size="small"
        rounded
        :disabled
        @click="emit('select', option.value)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CuiTileChipsEmits, CuiTileChipsProps } from './types.js';

defineProps<CuiTileChipsProps>();
const emit = defineEmits<CuiTileChipsEmits>();
</script>
