<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col field-gap">
      <label class="cui-label">Camera</label>
      <Select
        :model-value="data.cameraId"
        :options="cameraOptions"
        option-label="label"
        option-value="value"
        placeholder="Select camera"
        class="w-full"
        @update:model-value="onCameraChange"
      />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.sensor_type_label') }}</label>
      <Select
        :model-value="data.sensorType"
        :options="sensorOptions"
        option-label="label"
        option-value="value"
        placeholder="Select sensor type"
        class="w-full"
        :disabled="!data.cameraId"
        @update:model-value="onSensorTypeChange"
      />
    </div>

    <div v-if="data.sensorType" class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.sensor_instance') }}</label>
      <Select
        :model-value="selectedInstanceKey"
        :options="instanceSelectOptions"
        option-label="label"
        option-value="value"
        placeholder="Select sensor"
        class="w-full"
        :loading="instancesLoading"
        @update:model-value="onInstanceChange"
      />
    </div>

    <div v-if="conditions.length > 1" class="flex items-center gap-2">
      <span class="text-xs text-muted">{{ t('components.automation_nodes.condition_logic') }}</span>
      <SelectButton
        :model-value="data.logic"
        :options="logicOptions"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        class="cui-select-button-small"
        @update:model-value="update('logic', $event)"
      />
    </div>

    <div v-if="data.sensorName" class="flex flex-col gap-3">
      <div v-for="(cond, idx) in conditions" :key="idx" class="flex flex-col gap-1.5 p-2 rounded-md border-color">
        <div class="flex items-center gap-2">
          <Select
            :model-value="cond.property"
            :options="propertyOptions"
            option-label="label"
            option-value="value"
            placeholder="Property"
            class="flex-1"
            @update:model-value="updateCondition(idx, 'property', $event as string)"
          />
          <Button v-if="conditions.length > 1" severity="danger" text rounded class="shrink-0 cui-icon-sm" @click="removeCondition(idx)">
            <template #icon>
              <i-mdi:close width="100%" height="100%" />
            </template>
          </Button>
        </div>
        <InputText
          :model-value="cond.expectedValue"
          :placeholder="t('components.automation_nodes.condition_value_placeholder')"
          class="w-full"
          :disabled="!cond.property"
          @update:model-value="updateCondition(idx, 'expectedValue', String($event ?? ''))"
        />
      </div>

      <Button severity="secondary" outlined :label="t('components.automation_nodes.condition_add')" class="cui-button-small self-start" @click="addCondition" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { SensorType } from '@camera.ui/sdk';

import { useCameraOptions } from './useCameraOptions.js';

import type { ConfigConditionSensorStateProps, ConfigNodeUpdateEmits } from '../types.js';

const props = defineProps<ConfigConditionSensorStateProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();
const { cameraOptions, getSensorTypes, useSensorInstances, getPropertiesForSensor } = useCameraOptions();

const logicOptions = [
  { label: 'AND', value: 'AND' },
  { label: 'OR', value: 'OR' },
];

const sensorOptions = computed(() => {
  if (!props.data.cameraId) return [];
  return getSensorTypes(props.data.cameraId).map((s) => ({
    label: t(`components.camera_options.sensor_type_${s.value}`),
    value: s.value,
  }));
});

const cameraIdRef = computed(() => props.data.cameraId || undefined);
const sensorTypeRef = computed(() => (props.data.sensorType as SensorType) || SensorType.Contact);
const { instanceOptions, isLoading: instancesLoading } = useSensorInstances(cameraIdRef, sensorTypeRef);

const selectedInstanceKey = computed(() => {
  if (!props.data.sensorName || !props.data.sensorPluginId) return '';
  return `${props.data.sensorName}::${props.data.sensorPluginId}`;
});

const instanceSelectOptions = computed(() =>
  instanceOptions.value.map((inst) => ({
    label: inst.label,
    value: `${inst.sensorName}::${inst.pluginId}`,
  })),
);

const propertyOptions = computed(() => {
  if (!props.data.sensorType) return [];
  return getPropertiesForSensor(props.data.sensorType);
});

const conditions = computed(() => props.data.conditions ?? []);

function addCondition() {
  const current = [...conditions.value, { property: '', expectedValue: '' }];
  emit('update:data', { conditions: current });
}

function removeCondition(idx: number) {
  const current = [...conditions.value];
  current.splice(idx, 1);
  emit('update:data', { conditions: current });
}

function updateCondition(idx: number, field: 'property' | 'expectedValue', value: string) {
  const current = [...conditions.value];
  current[idx] = { ...current[idx], [field]: value };
  emit('update:data', { conditions: current });
}

function onCameraChange(value: unknown) {
  emit('update:data', { cameraId: value, sensorType: '', sensorName: '', sensorPluginId: '', conditions: [], logic: 'AND' });
}

function onSensorTypeChange(value: unknown) {
  emit('update:data', { sensorType: value, sensorName: '', sensorPluginId: '', conditions: [], logic: 'AND' });
}

function onInstanceChange(key: unknown) {
  const [sensorName, sensorPluginId] = String(key).split('::');
  emit('update:data', { sensorName, sensorPluginId, conditions: [{ property: '', expectedValue: '' }] });
}

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}
</script>
