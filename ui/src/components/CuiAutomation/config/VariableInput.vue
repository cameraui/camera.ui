<template>
  <AutoComplete
    :model-value="modelValue"
    :suggestions="filteredOptions"
    option-label="label"
    :placeholder="placeholder"
    class="w-full"
    fluid
    @complete="onSearch"
    @item-select="onSelect"
    @update:model-value="onInput"
  />
</template>

<script setup lang="ts">
import { getAvailableVariables } from './availableVariables.js';

import type { AutomationFlow, VariableInputEmits, VariableInputProps } from '../types.js';

const props = defineProps<VariableInputProps>();

const emit = defineEmits<VariableInputEmits>();

const store = useAutomationsStore();

const allOptions = computed(() => {
  const draft = store.draft as AutomationFlow | null;
  return getAvailableVariables(draft, props.nodeId);
});

const filteredOptions = ref<{ label: string; value: string }[]>([]);

function onSearch(event: { query: string }) {
  const query = event.query.toLowerCase();
  if (!query) {
    filteredOptions.value = allOptions.value;
  } else {
    filteredOptions.value = allOptions.value.filter((o) => o.label.toLowerCase().includes(query) || o.value.toLowerCase().includes(query));
  }
}

function onSelect(event: { value: { value: string } }) {
  emit('update:modelValue', event.value.value);
}

function onInput(value: unknown) {
  if (typeof value === 'string') {
    emit('update:modelValue', value);
  }
}
</script>
