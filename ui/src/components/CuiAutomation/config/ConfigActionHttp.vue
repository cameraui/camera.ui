<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.http_url') }}</label>
      <VariableInput :model-value="data.url" :node-id="nodeId" placeholder="https://example.com/webhook" @update:model-value="update('url', $event)" />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.http_method') }}</label>
      <Select :model-value="data.method" :options="methods" class="w-full" @update:model-value="update('method', $event)" />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.http_headers') }}</label>
      <div v-for="(row, index) in headerRows" :key="index" class="flex items-center gap-2">
        <InputText
          :model-value="row.name"
          :placeholder="t('components.automation_nodes.http_header_name')"
          class="flex-1 min-w-0"
          @update:model-value="setHeader(index, 'name', $event ?? '')"
        />
        <InputText
          :model-value="row.value"
          :placeholder="t('components.automation_nodes.http_header_value')"
          class="flex-1 min-w-0"
          @update:model-value="setHeader(index, 'value', $event ?? '')"
        />
        <Button text severity="danger" size="small" @click="removeHeader(index)">
          <i-mdi:delete class="w-4 h-4" />
        </Button>
      </div>
      <Button severity="secondary" outlined size="small" class="self-start" :label="t('components.automation_nodes.http_add_header')" @click="addHeader" />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.http_body') }}</label>
      <Textarea :model-value="data.body" placeholder='{"key": "value"}' rows="4" class="w-full font-mono text-xs" @update:model-value="update('body', $event)" />
      <VariableSuggestions :variables="availableVars" @select="insertVariable($event)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useFlowVariables } from './flowSchema.js';
import VariableInput from './VariableInput.vue';
import VariableSuggestions from './VariableSuggestions.vue';

import type { ConfigActionHttpProps, ConfigNodeUpdateEmits } from '../types.js';

const props = defineProps<ConfigActionHttpProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();

const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

const { options: availableVars } = useFlowVariables(() => props.nodeId);

const headerRows = ref(Object.entries(props.data.headers ?? {}).map(([name, value]) => ({ name, value })));

function addHeader() {
  headerRows.value.push({ name: '', value: '' });
}

function setHeader(index: number, field: 'name' | 'value', value: string) {
  const row = headerRows.value[index];
  if (!row) return;
  row[field] = value;
  commitHeaders();
}

function removeHeader(index: number) {
  headerRows.value.splice(index, 1);
  commitHeaders();
}

function commitHeaders() {
  const headers: Record<string, string> = {};
  for (const row of headerRows.value) {
    if (row.name.trim()) headers[row.name.trim()] = row.value;
  }
  emit('update:data', { headers });
}

function insertVariable(variable: string) {
  const current = props.data.body ?? '';
  emit('update:data', { body: current + variable });
}

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}
</script>
