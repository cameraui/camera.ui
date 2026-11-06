<template>
  <div class="flex flex-col gap-2 w-full">
    <VariableInput
      v-if="variableMode && nodeId"
      :model-value="modelValue"
      :node-id="nodeId"
      :placeholder="t('components.automation_nodes.sensor_value_variable_placeholder')"
      @update:model-value="emitValue"
    />

    <InputText
      v-else-if="variableMode"
      :model-value="modelValue"
      :placeholder="t('components.automation_nodes.sensor_value_variable_placeholder')"
      class="w-full font-mono text-xs"
      :disabled
      @update:model-value="(v) => emitValue(String(v ?? ''))"
    />

    <CuiToggleRow v-else-if="meta.kind === 'boolean'" :label="t('components.automation_nodes.sensor_value_state')">
      <ToggleSwitch :model-value="booleanValue" :disabled @update:model-value="(v) => emitValue(String(v))" />
    </CuiToggleRow>

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

    <CuiNumberStepper
      v-else-if="meta.kind === 'number'"
      :model-value="numberValue"
      :min="meta.min"
      :max="meta.max"
      :max-fraction-digits="3"
      fluid
      :disabled
      @update:model-value="(v) => emitValue(v === null || v === undefined ? '' : String(v))"
    />

    <Select
      v-else-if="presetOptions.length"
      :model-value="modelValue"
      :options="presetOptions"
      editable
      class="w-full"
      :disabled
      @update:model-value="(v) => emitValue(String(v ?? ''))"
    />

    <InputText
      v-else
      :model-value="modelValue"
      :placeholder="t('components.automation_nodes.condition_value_placeholder')"
      class="w-full"
      :disabled
      @update:model-value="(v) => emitValue(String(v ?? ''))"
    />
  </div>
</template>

<script setup lang="ts">
import { useAllSensors } from '@camera.ui/browser';
import { useFaceStore } from '@camera.ui/nvr';
import { SensorType } from '@camera.ui/sdk';

import { getSensorPropertyInput } from './sensorPropertyInputs.js';
import VariableInput from './VariableInput.vue';

const props = defineProps<{
  sensorType: string;
  property: string;
  modelValue: string;
  variableMode?: boolean;
  nodeId?: string;
  disabled?: boolean;
  sensorId?: string;
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

const isPresetProperty = computed(() => props.sensorType === SensorType.PTZ && props.property === 'targetPreset');
const isFaceIdentity = computed(() => props.sensorType === SensorType.Face && props.property === 'identities');

const { sensors } = useAllSensors();
const faceStore = useFaceStore();

const presetOptions = computed(() => {
  if (isFaceIdentity.value) return faceStore.knownFaces.value.map((face) => face.name);
  if (!isPresetProperty.value) return [];
  const sensor = sensors.value.find((s) => s.id === props.sensorId);
  const presets = sensor?.getProperty('presets');
  return Array.isArray(presets) ? presets.filter((p): p is string => typeof p === 'string') : [];
});

function emitValue(value: string) {
  emit('update:modelValue', value);
}
</script>
