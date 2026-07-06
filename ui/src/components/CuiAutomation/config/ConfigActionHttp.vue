<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col field-gap">
      <label class="cui-label">URL</label>
      <VariableInput :model-value="data.url" :node-id="nodeId" placeholder="https://example.com/webhook" @update:model-value="update('url', $event)" />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">Method</label>
      <Select :model-value="data.method" :options="methods" class="w-full" @update:model-value="update('method', $event)" />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">Body</label>
      <Textarea :model-value="data.body" placeholder='{"key": "value"}' rows="4" class="w-full font-mono text-xs" @update:model-value="update('body', $event)" />
      <VariableSuggestions :variables="availableVars" @select="insertVariable($event)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { getAvailableVariables } from './availableVariables.js';
import VariableInput from './VariableInput.vue';
import VariableSuggestions from './VariableSuggestions.vue';

import type { AutomationFlow, ConfigActionHttpProps, ConfigNodeUpdateEmits } from '../types.js';

const props = defineProps<ConfigActionHttpProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const store = useAutomationsStore();

const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

const availableVars = computed(() => getAvailableVariables(store.draft as AutomationFlow | null, props.nodeId));

function insertVariable(variable: string) {
  const current = props.data.body ?? '';
  emit('update:data', { body: current + variable });
}

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}
</script>
