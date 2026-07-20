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
      <div v-if="suggestedValues.length" class="flex flex-col gap-2 mt-1">
        <span class="text-muted text-xs">{{ t('components.automation_nodes.switch_cases_suggested') }}</span>
        <div class="flex flex-wrap gap-2">
          <Button
            v-for="option in suggestedValues"
            :key="option.value"
            severity="secondary"
            outlined
            size="small"
            :label="option.label"
            @click="update('rightOperand', option.value)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getNodeDefinition } from '../nodeDefinitions.js';
import { findFlowVariable, flowValueOptions } from './flowSchema.js';
import VariableInput from './VariableInput.vue';

import type { AutomationFlow, ConfigConditionIfElseProps, ConfigNodeUpdateEmits } from '../types.js';

const props = defineProps<ConfigConditionIfElseProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();

const store = useAutomationsStore();

const operators = [
  { label: `== (${t('components.automation_nodes.operator_equals')})`, value: '==' },
  { label: `!= (${t('components.automation_nodes.operator_not_equals')})`, value: '!=' },
  { label: `> (${t('components.automation_nodes.operator_greater')})`, value: '>' },
  { label: `< (${t('components.automation_nodes.operator_less')})`, value: '<' },
  { label: `>= (${t('components.automation_nodes.operator_greater_equal')})`, value: '>=' },
  { label: `<= (${t('components.automation_nodes.operator_less_equal')})`, value: '<=' },
  { label: t('components.automation_nodes.operator_contains'), value: 'contains' },
  { label: t('components.automation_nodes.operator_starts_with'), value: 'startsWith' },
  { label: t('components.automation_nodes.operator_ends_with'), value: 'endsWith' },
];

const sourceNode = computed(() => store.getDraftSourceNode(props.nodeId));

const sourceLabel = computed(() => {
  if (!sourceNode.value?.type) return '';
  const def = getNodeDefinition(sourceNode.value.type);
  return def ? t(def.labelKey) : sourceNode.value.type;
});

// values the left operand's variable is known to produce
const suggestedValues = computed(() => {
  const variable = findFlowVariable(store.draft as AutomationFlow | null, props.nodeId, props.data.leftOperand);
  return flowValueOptions(variable, t).filter((option) => option.value !== props.data.rightOperand);
});

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}
</script>
