<template>
  <AutoComplete
    :model-value="modelValue"
    :suggestions="filteredOptions"
    option-label="label"
    :placeholder="placeholder"
    class="w-full"
    fluid
    dropdown
    dropdown-mode="blank"
    @complete="onSearch"
    @item-select="onSelect"
    @update:model-value="onInput"
  >
    <template #option="{ option }">
      <div class="flex items-center justify-between gap-3 w-full min-w-0">
        <span class="truncate">{{ option.label }}</span>
        <span class="text-[10px] text-muted font-mono shrink-0">{{ option.value }}</span>
      </div>
    </template>
  </AutoComplete>
</template>

<script setup lang="ts">
import { useFlowVariables } from './flowSchema.js';

import type { VariableInputEmits, VariableInputProps } from '../types.js';
import type { FlowVariableOption } from './flowSchema.js';

const props = defineProps<VariableInputProps>();

const emit = defineEmits<VariableInputEmits>();

const { options: allOptions } = useFlowVariables(() => props.nodeId);

const filteredOptions = ref<FlowVariableOption[]>([]);
const lastQuery = ref('');

function onSearch(event: { query: string }) {
  const query = event.query.toLowerCase();
  lastQuery.value = event.query;
  if (!query) {
    filteredOptions.value = [...allOptions.value];
  } else {
    filteredOptions.value = allOptions.value.filter((o) => o.label.toLowerCase().includes(query) || o.value.toLowerCase().includes(query));
  }
}

function onSelect(event: { value: { value: string } }) {
  let current = props.modelValue ?? '';
  if (lastQuery.value && current.toLowerCase().endsWith(lastQuery.value.toLowerCase())) {
    current = current.slice(0, current.length - lastQuery.value.length);
  }
  emit('update:modelValue', current + event.value.value);
}

function onInput(value: unknown) {
  if (typeof value === 'string') {
    emit('update:modelValue', value);
  }
}
</script>
