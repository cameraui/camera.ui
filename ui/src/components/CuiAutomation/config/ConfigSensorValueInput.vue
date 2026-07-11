<template>
  <ToggleSwitch v-if="meta.kind === 'boolean'" :model-value="booleanValue" :disabled @update:model-value="(v) => emitValue(String(v))" />

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
    class="w-full"
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
</template>

<script setup lang="ts">
import { getSensorPropertyInput } from './sensorPropertyInputs.js';

const props = defineProps<{
  sensorType: string;
  property: string;
  modelValue: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const { t } = useI18n();

const meta = computed(() => getSensorPropertyInput(props.sensorType, props.property));

const booleanValue = computed(() => props.modelValue === 'true');

const numberValue = computed(() => {
  const parsed = Number(props.modelValue);
  return props.modelValue !== '' && Number.isFinite(parsed) ? parsed : null;
});

const enumOptions = computed(() => (meta.value.options ?? []).map((option) => ({ label: t(`components.automation_nodes.${option.labelKey}`), value: option.value })));

function emitValue(value: string) {
  emit('update:modelValue', value);
}
</script>
