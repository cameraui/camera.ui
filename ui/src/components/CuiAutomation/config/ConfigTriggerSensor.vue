<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.camera') }}</label>
      <Select
        :model-value="data.cameraId"
        :options="cameraOptions"
        option-label="label"
        option-value="value"
        :placeholder="t('components.automation_nodes.camera_placeholder')"
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
        :placeholder="t('components.automation_nodes.sensor_type_placeholder')"
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
        :placeholder="t('components.automation_nodes.sensor_instance_placeholder')"
        class="w-full"
        :loading="instancesLoading"
        @update:model-value="onInstanceChange"
      />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.sensor_properties') }}</label>
      <MultiSelect
        :model-value="data.properties"
        :options="propertyOptions"
        option-label="label"
        option-value="value"
        :placeholder="t('components.automation_nodes.sensor_properties_placeholder')"
        class="w-full"
        :disabled="!data.sensorName"
        @update:model-value="update('properties', $event)"
      />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.sensor_properties_hint') }}</Message>
    </div>
  </div>
</template>

<script setup lang="ts">
import { SensorType } from '@camera.ui/sdk';

import { useCameraOptions } from './useCameraOptions.js';

import type { ConfigNodeUpdateEmits, ConfigTriggerSensorProps } from '../types.js';

const props = defineProps<ConfigTriggerSensorProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();
const { cameraOptions, getSensorTypes, useSensorInstances, getPropertiesForSensor } = useCameraOptions();

const sensorOptions = computed(() => {
  if (!props.data.cameraId) return [];
  return getSensorTypes(props.data.cameraId)
    .filter((s) => !s.meta.isDetectionType)
    .map((s) => ({
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

function onCameraChange(value: unknown) {
  emit('update:data', { cameraId: value, sensorType: '', sensorName: '', sensorPluginId: '', properties: [] });
}

function onSensorTypeChange(value: unknown) {
  emit('update:data', { sensorType: value, sensorName: '', sensorPluginId: '', properties: [] });
}

function onInstanceChange(key: unknown) {
  const [sensorName, sensorPluginId] = String(key).split('::');
  emit('update:data', { sensorName, sensorPluginId, properties: [] });
}

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}
</script>
