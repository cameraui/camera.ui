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

    <div v-if="data.sensorName && propertyOptions.length" class="flex flex-col gap-3">
      <label class="cui-label">{{ t('components.automation_nodes.sensor_properties') }}</label>
      <div v-for="prop in propertyOptions" :key="prop.value" class="flex flex-col gap-1.5 p-2 rounded-md border-color">
        <div class="flex items-center gap-2">
          <Checkbox :model-value="isPropertyEnabled(prop.value)" binary @update:model-value="toggleProperty(prop.value, $event)" />
          <span class="text-sm font-medium flex-1">{{ prop.label }}</span>
          <ConfigSensorValueInput
            v-if="isPropertyEnabled(prop.value) && isBooleanProperty(prop.value)"
            :sensor-type="data.sensorType"
            :property="prop.value"
            :model-value="getPropertyValue(prop.value)"
            @update:model-value="(value) => setPropertyValue(prop.value, value)"
          />
        </div>
        <ConfigSensorValueInput
          v-if="isPropertyEnabled(prop.value) && !isBooleanProperty(prop.value)"
          :sensor-type="data.sensorType"
          :property="prop.value"
          :model-value="getPropertyValue(prop.value)"
          @update:model-value="(value) => setPropertyValue(prop.value, value)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { SensorCategory, SensorType } from '@camera.ui/sdk';

import { SENSOR_TYPE_CONFIG, VIRTUAL_SENSOR_OWNER_ID } from '@shared/types';
import ConfigSensorValueInput from './ConfigSensorValueInput.vue';
import { getSensorPropertyDefaultValue, getSensorPropertyInput } from './sensorPropertyInputs.js';
import { useCameraOptions } from './useCameraOptions.js';

import type { ConfigActionSensorProps, ConfigNodeUpdateEmits } from '../types.js';

const props = defineProps<ConfigActionSensorProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();
const { cameraOptions, getSensorTypes, useSensorInstances, getPropertiesForSensor } = useCameraOptions();

const sensorOptions = computed(() => {
  if (!props.data.cameraId) return [];
  return (
    getSensorTypes(props.data.cameraId)
      // Trigger sensors (doorbell) dispatch updateValue to trigger(); read-only sensor
      // categories are only writable when a virtual instance backs them
      .filter((s) => s.meta.category === SensorCategory.Control || s.meta.category === SensorCategory.Trigger || (s.hasVirtual && !s.meta.isDetectionType))
      .map((s) => ({
        label: t(`components.camera_options.sensor_type_${s.value}`),
        value: s.value,
      }))
  );
});

const cameraIdRef = computed(() => props.data.cameraId || undefined);
const sensorTypeRef = computed(() => (props.data.sensorType as SensorType) || SensorType.Light);
const { instanceOptions, isLoading: instancesLoading } = useSensorInstances(cameraIdRef, sensorTypeRef);

const selectedInstanceKey = computed(() => {
  if (!props.data.sensorName || !props.data.sensorPluginId) return '';
  return `${props.data.sensorName}::${props.data.sensorPluginId}`;
});

const instanceSelectOptions = computed(() => {
  const category = props.data.sensorType ? SENSOR_TYPE_CONFIG[props.data.sensorType as SensorType]?.category : undefined;
  return instanceOptions.value
    .filter((inst) => category === SensorCategory.Control || category === SensorCategory.Trigger || inst.pluginId === VIRTUAL_SENSOR_OWNER_ID)
    .map((inst) => ({
      label: inst.label,
      value: `${inst.sensorName}::${inst.pluginId}`,
    }));
});

const propertyOptions = computed(() => {
  if (!props.data.sensorType) return [];
  return getPropertiesForSensor(props.data.sensorType);
});

const propertiesMap = computed(() => {
  const map = new Map<string, string>();
  for (const p of props.data.properties ?? []) {
    map.set(p.property, p.value);
  }
  return map;
});

function isPropertyEnabled(property: string): boolean {
  return propertiesMap.value.has(property);
}

function isBooleanProperty(property: string): boolean {
  return getSensorPropertyInput(String(props.data.sensorType ?? ''), property).kind === 'boolean';
}

function getPropertyValue(property: string): string {
  return propertiesMap.value.get(property) ?? '';
}

function toggleProperty(property: string, enabled: unknown) {
  const current = [...(props.data.properties ?? [])];
  if (enabled) {
    if (!current.some((p) => p.property === property)) {
      current.push({ property, value: getSensorPropertyDefaultValue(String(props.data.sensorType ?? ''), property) });
    }
  } else {
    const idx = current.findIndex((p) => p.property === property);
    if (idx >= 0) current.splice(idx, 1);
  }
  emit('update:data', { properties: current });
}

function setPropertyValue(property: string, value: string) {
  const current = [...(props.data.properties ?? [])];
  const existing = current.find((p) => p.property === property);
  if (existing) {
    existing.value = value;
  } else {
    current.push({ property, value });
  }
  emit('update:data', { properties: current });
}

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
</script>
