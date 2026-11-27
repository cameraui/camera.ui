<template>
  <div class="tile-choice-row">
    <CuiTileAction
      v-for="option in options"
      :key="option.value"
      class="tile-choice-row__option"
      show-label
      :label="option.label"
      :active="option.value === selected"
      :interactive
      @click="emit('select', option.value)"
    />
    <slot />
  </div>
</template>

<script setup lang="ts">
import CuiTileAction from './CuiTileAction.vue';

import type { CuiTileChoiceRowEmits, CuiTileChoiceRowProps } from './types.js';

defineProps<CuiTileChoiceRowProps>();
const emit = defineEmits<CuiTileChoiceRowEmits>();
</script>

<style scoped>
.tile-choice-row {
  display: flex;
  gap: 0.5rem;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.tile-choice-row .tile-choice-row__option,
.tile-choice-row :slotted(.tile-action) {
  flex: 0 0 auto;
  height: 2.5rem;
}
</style>
