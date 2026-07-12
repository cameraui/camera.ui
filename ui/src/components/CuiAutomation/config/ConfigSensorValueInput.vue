<template>
  <div class="flex flex-col gap-2 w-full">
    <InputText
      v-if="variableMode"
      :model-value="modelValue"
      :placeholder="t('components.automation_nodes.sensor_value_variable_placeholder')"
      class="w-full font-mono text-xs"
      :disabled
      @update:model-value="(v) => emitValue(String(v ?? ''))"
    />

    <ToggleSwitch v-else-if="meta.kind === 'boolean'" :model-value="booleanValue" :disabled @update:model-value="(v) => emitValue(String(v))" />

    <Select
      v-else-if="meta.kind === 'enum'"
      :model-value="modelValue"
      :options="enumOptions"
      option-label="label"
      option-value="value"
      class="w-full"
      :disabled
      @update:model-value="(v) => emitValue(String(v ?? ''))"
    />

    <InputNumber
      v-else-if="meta.kind === 'number'"
      :model-value="numberValue"
      :min="meta.min"
      :max="meta.max"
      show-buttons
      fluid
      :disabled
      @update:model-value="(v) => emitValue(v === null || v === undefined ? '' : String(v))"
    />

    <InputText
      v-else
      :model-value="modelValue"
      :placeholder="t('components.automation_nodes.condition_value_placeholder')"
      class="w-full"
      :disabled
      @update:model-value="(v) => emitValue(String(v ?? ''))"
    />

    <VariableSuggestions v-if="nodeId && variableMode" :variables="availableVars" @select="insertVariable" />
  </div>
</template>

<script setup lang="ts">
import { getAvailableVariables } from './availableVariables.js';
import { getSensorPropertyInput } from './sensorPropertyInputs.js';
import VariableSuggestions from './VariableSuggestions.vue';

import type { AutomationFlow } from '../types.js';

const props = defineProps<{
  sensorType: string;
  property: string;
  modelValue: string;
  variableMode?: boolean;
  nodeId?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const { t } = useI18n();

const store = useAutomationsStore();

const meta = computed(() => getSensorPropertyInput(props.sensorType, props.property));

const booleanValue = computed(() => props.modelValue === 'true');

const numberValue = computed(() => {
  const parsed = Number(props.modelValue);
  return props.modelValue !== '' && Number.isFinite(parsed) ? parsed : null;
});

const enumOptions = computed(() => (meta.value.options ?? []).map((option) => ({ label: t(`components.automation_nodes.${option.labelKey}`), value: option.value })));

const availableVars = computed(() => getAvailableVariables(store.draft as AutomationFlow | null, props.nodeId ?? ''));

function insertVariable(variable: string) {
  emitValue((props.modelValue ?? '') + variable);
}

function emitValue(value: string) {
  emit('update:modelValue', value);
}
</script>
