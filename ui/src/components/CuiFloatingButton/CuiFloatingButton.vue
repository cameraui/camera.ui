<template>
  <div class="transition-all duration-300 ease-in-out cui-icon-3xl hover:scale-110" v-tooltip.left="tooltipProps">
    <Button v-bind="buttonProps" rounded @click="$emit('click')" :label="label" class="shadow-lg">
      <template v-if="icon" #icon>
        <component :is="icon" v-bind="iconProps" />
      </template>
    </Button>
  </div>
</template>

<script setup lang="ts">
import type { CuiFloatingButtonEmits, CuiFloatingButtonProps } from './types.js';

defineProps<CuiFloatingButtonProps>();

defineEmits<CuiFloatingButtonEmits>();
</script>

<style scoped></style>
