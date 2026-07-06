<template>
  <div
    class="flex flex-wrap gap-2"
    :class="{
      'opacity-60 pointer-events-none': disabled,
    }"
  >
    <slot></slot>
  </div>
</template>

<script lang="ts" setup>
import type { CuiChipGroupProps } from './types.js';

const props = defineProps<CuiChipGroupProps>();

const modelValue = defineModel<string | number | object | undefined>({
  required: false,
});

const { selectedClass, disabled, mandatory, multiple } = toRefs(props);

function updateSelected(value: string | number | object) {
  if (disabled.value) {
    return;
  }

  if (multiple.value) {
    let newSelected = [...(Array.isArray(modelValue.value) ? modelValue.value : [])];

    if (newSelected.includes(value)) {
      if (!mandatory.value || newSelected.length > 1) {
        newSelected = newSelected.filter((item) => item !== value);
      }
    } else {
      newSelected.push(value);
    }

    modelValue.value = newSelected;
  } else {
    if (modelValue.value === value) {
      if (!mandatory.value) {
        modelValue.value = undefined;
      }
    } else {
      modelValue.value = value;
    }
  }
}

provide('chipGroup', {
  modelValue,
  selectedClass,
  disabled,
  mandatory,
  updateSelected,
});
</script>

<style scoped></style>
