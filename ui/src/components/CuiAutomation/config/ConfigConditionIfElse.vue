<template>
  <div class="flex flex-col gap-4">
    <div v-if="sourceLabel" class="cui-banner cui-banner-info">
      <i-mdi:information-outline class="w-5 h-5 shrink-0" />
      <span>{{ t('components.automation_nodes.condition_source_info', { source: sourceLabel }) }}</span>
    </div>
    <div v-else class="cui-banner cui-banner-warn">
      <i-mdi:alert-outline class="w-5 h-5 shrink-0" />
      <span>{{ t('components.automation_nodes.condition_no_source') }}</span>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.condition_variable') }}</label>
      <VariableInput
        :model-value="data.leftOperand"
        :node-id="nodeId"
        :placeholder="t('components.automation_nodes.condition_variable_placeholder')"
        @update:model-value="update('leftOperand', $event)"
      />
      <VariableSuggestions :variables="availableVars" @select="update('leftOperand', $event)" />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.condition_operator') }}</label>
      <Select
        :model-value="data.operator"
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
        :model-value="data.rightOperand"
        :node-id="nodeId"
        :placeholder="t('components.automation_nodes.condition_value_placeholder')"
        @update:model-value="update('rightOperand', $event)"
      />
      <VariableSuggestions :variables="availableVars" @select="update('rightOperand', $event)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { getNodeDefinition } from '../nodeDefinitions.js';
import { getAvailableVariables } from './availableVariables.js';
import VariableInput from './VariableInput.vue';
import VariableSuggestions from './VariableSuggestions.vue';

import type { AutomationFlow, ConfigConditionIfElseProps, ConfigNodeUpdateEmits } from '../types.js';

const props = defineProps<ConfigConditionIfElseProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();

const store = useAutomationsStore();

const operators = [
  { label: '== (equals)', value: '==' },
  { label: '!= (not equals)', value: '!=' },
  { label: '> (greater than)', value: '>' },
  { label: '< (less than)', value: '<' },
  { label: '>= (greater or equal)', value: '>=' },
  { label: '<= (less or equal)', value: '<=' },
  { label: 'contains', value: 'contains' },
  { label: 'starts with', value: 'startsWith' },
  { label: 'ends with', value: 'endsWith' },
];

const sourceNode = computed(() => store.getDraftSourceNode(props.nodeId));

const sourceLabel = computed(() => {
  if (!sourceNode.value?.type) return '';
  const def = getNodeDefinition(sourceNode.value.type);
  return def ? t(def.labelKey) : sourceNode.value.type;
});

const availableVars = computed(() => getAvailableVariables(store.draft as AutomationFlow | null, props.nodeId));

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}
</script>
