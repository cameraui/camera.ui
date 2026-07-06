<template>
  <Chip
    :removable="removable"
    :disabled="isDisabled"
    class="cui-chip inline-flex cursor-pointer transition-all rounded-full py-1 px-2 relative justify-center items-center"
    :class="[
      {
        'cui-chip-selected': isSelected,
        'cui-chip-disabled': isDisabled,
        'cui-chip-small': size === 'small',
        'cui-chip-medium': size === 'medium',
        'cui-chip-large': size === 'large',
        'pl-7': filter && isSelected,
      },
      selectedClass,
    ]"
    @click="handleClick"
  >
    <Transition name="fade">
      <div v-if="filter && isSelected" class="absolute left-1 top-1/2 transform -translate-y-1/2 flex items-center justify-center cui-icon-sm">
        <i-mdi:check width="100%" height="100%" />
      </div>
    </Transition>
    <slot></slot>
    <slot name="append"></slot>
  </Chip>
</template>

<script lang="ts" setup>
import type { CuiChipGroupProps } from '@/components/CuiChipGroup/types.js';
import type { CuiChipProps } from './types.js';

const props = defineProps<CuiChipProps>();

const { value, removable, disabled, size, filter } = toRefs(props);

const chipGroup = inject<{
  modelValue: Ref<string | number | object | undefined>;
  selectedClass: Ref<CuiChipGroupProps['selectedClass']>;
  disabled: Ref<CuiChipGroupProps['disabled']>;
  mandatory: Ref<CuiChipGroupProps['mandatory']>;
  updateSelected: (value: string | number | object) => void;
}>('chipGroup');

const isDisabled = computed(() => {
  return Boolean(disabled.value || chipGroup?.disabled.value);
});
const isSelected = computed(() => {
  if (!chipGroup) {
    return false;
  }

  const selectedValue = chipGroup.modelValue.value;

  if (Array.isArray(selectedValue)) {
    return selectedValue.includes(value.value);
  }

  return selectedValue === value.value;
});
const selectedClass = computed(() => {
  return isSelected.value ? chipGroup?.selectedClass.value : undefined;
});

function handleClick() {
  if (isDisabled.value) {
    return;
  }

  chipGroup?.updateSelected(value.value);
}
</script>

<style scoped>
.cui-chip {
  background-color: var(--chip-background);
  transition:
    padding 0.2s ease,
    background-color 0.2s ease;
}

.cui-chip:hover:not(.cui-chip-disabled):not(.cui-chip-selected) {
  background-color: var(--chip-background-hover);
}

.cui-chip:active:not(.cui-chip-disabled):not(.cui-chip-selected) {
  background-color: var(--chip-background-active);
}

.cui-chip-selected {
  background-color: var(--primary-500);
  color: #fff;
}

.cui-chip-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.cui-chip-small {
  font-size: 0.8rem;
}

.cui-chip-medium {
  font-size: 0.9rem;
}

.cui-chip-large {
  font-size: 1rem;
}
</style>
