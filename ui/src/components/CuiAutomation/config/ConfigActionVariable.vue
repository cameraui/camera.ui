<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.variable_name') }}</label>
      <InputText :model-value="data.variableName" placeholder="myVariable" @update:model-value="update('variableName', $event)" />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.variable_name_hint') }}</Message>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.variable_operator') }}</label>
      <Select
        :model-value="data.operator ?? '='"
        :options="operators"
        option-label="label"
        option-value="value"
        class="w-full"
        @update:model-value="update('operator', $event)"
      />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.condition_value') }}</label>
      <VariableInput
        :model-value="data.value"
        :node-id="nodeId"
        :placeholder="t('components.automation_nodes.variable_value_placeholder')"
        @update:model-value="update('value', $event)"
      />
      <VariableSuggestions :variables="availableVars" @select="update('value', (data.value ?? '') + $event)" />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.variable_value_hint') }}</Message>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getAvailableVariables } from './availableVariables.js';
import VariableInput from './VariableInput.vue';
import VariableSuggestions from './VariableSuggestions.vue';

import type { AutomationFlow, ConfigActionVariableProps, ConfigNodeUpdateEmits } from '../types.js';

const props = defineProps<ConfigActionVariableProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();

const store = useAutomationsStore();

const operators = [
  { label: '= (Set)', value: '=' },
  { label: '+= (Add)', value: '+=' },
  { label: '-= (Subtract)', value: '-=' },
];

const availableVars = computed(() => getAvailableVariables(store.draft as AutomationFlow | null, props.nodeId));

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}
</script>
