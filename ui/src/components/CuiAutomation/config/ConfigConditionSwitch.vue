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
        :model-value="data.variable"
        :node-id="nodeId"
        :placeholder="t('components.automation_nodes.condition_variable_placeholder')"
        @update:model-value="update('variable', $event)"
      />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.switch_cases') }}</label>
      <AutoComplete
        :model-value="data.cases"
        multiple
        :typeahead="false"
        :placeholder="t('components.automation_nodes.switch_cases_placeholder')"
        @update:model-value="update('cases', $event)"
      />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.switch_cases_hint') }}</Message>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getNodeDefinition } from '../nodeDefinitions.js';
import VariableInput from './VariableInput.vue';

import type { ConfigConditionSwitchProps, ConfigNodeUpdateEmits } from '../types.js';

const props = defineProps<ConfigConditionSwitchProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();

const store = useAutomationsStore();

const sourceNode = computed(() => store.getDraftSourceNode(props.nodeId));

const sourceLabel = computed(() => {
  if (!sourceNode.value?.type) return '';
  const def = getNodeDefinition(sourceNode.value.type);
  return def ? t(def.labelKey) : sourceNode.value.type;
});

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}
</script>
