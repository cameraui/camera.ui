<template>
  <div class="flex flex-col gap-4">
    <div v-for="(entry, index) in data.variables" :key="index" class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium text-muted">{{ t('components.automation_nodes.variable') }} #{{ index + 1 }}</span>
        <Button severity="danger" text rounded class="cui-icon-sm" @click="removeEntry(index)">
          <template #icon><i-mdi:close width="100%" height="100%" /></template>
        </Button>
      </div>
      <div class="flex flex-col field-gap">
        <label class="cui-label">{{ t('components.automation_nodes.output_label') }}</label>
        <InputText
          :model-value="entry.label"
          :placeholder="t('components.automation_nodes.output_label_placeholder')"
          @update:model-value="updateEntry(index, 'label', String($event ?? ''))"
        />
      </div>
      <div class="flex flex-col field-gap">
        <label class="cui-label">{{ t('components.automation_nodes.condition_value') }}</label>
        <VariableInput
          :model-value="entry.value"
          :node-id="nodeId"
          placeholder="{{plugin.result}}"
          @update:model-value="updateEntry(index, 'value', String($event ?? ''))"
        />
      </div>
      <Divider v-if="index < data.variables.length - 1" />
    </div>

    <Button severity="secondary" outlined class="cui-button-small" :label="t('components.automation_nodes.output_add')" @click="addEntry" />
    <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.output_hint') }}</Message>
  </div>
</template>

<script setup lang="ts">
import VariableInput from './VariableInput.vue';

import type { ConfigActionOutputProps, ConfigNodeUpdateEmits } from '../types.js';

const props = defineProps<ConfigActionOutputProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();

function addEntry() {
  emit('update:data', { variables: [...props.data.variables, { label: '', value: '' }] });
}

function removeEntry(index: number) {
  const updated = props.data.variables.filter((_, i) => i !== index);
  emit('update:data', { variables: updated });
}

function updateEntry(index: number, key: 'label' | 'value', val: string) {
  const updated = props.data.variables.map((entry, i) => (i === index ? { ...entry, [key]: val } : entry));
  emit('update:data', { variables: updated });
}
</script>
