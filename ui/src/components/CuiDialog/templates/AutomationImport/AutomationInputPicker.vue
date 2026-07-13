<template>
  <div class="flex flex-col field-gap">
    <label class="cui-label">{{ input.label || input.key }}</label>

    <Select
      v-if="input.type === 'camera'"
      :model-value="modelValue"
      :options="cameraOptions"
      option-label="label"
      option-value="value"
      :placeholder="$t('components.automation_import.select_camera')"
      class="w-full"
      @update:model-value="emit('update:modelValue', $event)"
    />

    <template v-else-if="input.type === 'plugin'">
      <Select
        :model-value="modelValue"
        :options="pluginOptions"
        option-label="label"
        option-value="value"
        :placeholder="$t('components.automation_import.select_plugin')"
        class="w-full"
        :disabled="!pluginOptions.length"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <Message v-if="!pluginOptions.length" severity="warn" variant="simple" size="small" class="cui-input-hint">
        {{ $t('components.automation_import.no_plugin_for_interface', { interface: input.interface }) }}
      </Message>
    </template>

    <MultiSelect
      v-else-if="input.type === 'notification-targets'"
      :model-value="modelValue"
      :options="userOptions"
      option-label="label"
      option-value="value"
      :placeholder="$t('components.automation_import.select_targets')"
      class="w-full"
      @update:model-value="emit('update:modelValue', $event)"
    />

    <template v-else-if="input.type === 'sensor'">
      <Select
        v-model="sensorCameraId"
        :options="cameraOptions"
        option-label="label"
        option-value="value"
        :placeholder="$t('components.automation_import.select_camera')"
        class="w-full"
      />
      <Select
        v-model="sensorTypeValue"
        :options="sensorTypeOptions"
        option-label="label"
        option-value="value"
        :placeholder="$t('components.automation_import.select_sensor_type')"
        class="w-full"
        :disabled="!sensorCameraId"
      />
      <Select
        :model-value="selectedInstanceKey"
        :options="instanceSelectOptions"
        option-label="label"
        option-value="value"
        :placeholder="$t('components.automation_import.select_sensor')"
        class="w-full"
        :loading="instancesLoading"
        :disabled="!sensorTypeValue"
        @update:model-value="onInstanceChange"
      />
    </template>

    <InputText
      v-else-if="input.type === 'system-target'"
      :model-value="(modelValue as string) ?? ''"
      :placeholder="$t('components.automation_import.enter_target_id')"
      class="w-full"
      @update:model-value="emit('update:modelValue', $event ?? '')"
    />

    <InputText
      v-else-if="input.type === 'text'"
      :model-value="(modelValue as string) ?? ''"
      :placeholder="input.placeholder"
      class="w-full"
      @update:model-value="emit('update:modelValue', $event ?? '')"
    />
  </div>
</template>

<script setup lang="ts">
import { SensorType } from '@camera.ui/sdk';

import { PluginsQuery } from '@/api/routes/plugins.js';
import { useCameraOptions } from '@/components/CuiAutomation/config/useCameraOptions.js';
import { useUserOptions } from '@/components/CuiAutomation/config/useUserOptions.js';

import type { SensorBinding } from '@/common/automationBlueprint.js';
import type { AutomationInputPickerEmits, AutomationInputPickerProps } from './types.js';

const pluginsQuery = new PluginsQuery();

const props = defineProps<AutomationInputPickerProps>();
const emit = defineEmits<AutomationInputPickerEmits>();

const { t } = useI18n();
const { cameraOptions, getSensorTypes, useSensorInstances } = useCameraOptions();
const { userOptions } = useUserOptions();

const { data: pluginsData } = pluginsQuery.getPluginsQuery({ page: 1, pageSize: -1 });

const sensorCameraId = ref('');
const sensorTypeValue = ref('');

const pluginOptions = computed(() => {
  const required = props.input.interface;
  return (pluginsData.value?.result ?? [])
    .filter((plugin) => (required ? (plugin.contract?.interfaces ?? []).includes(required as never) : (plugin.contract?.interfaces?.length ?? 0) > 0))
    .map((plugin) => ({ label: plugin.displayName || plugin.pluginName, value: plugin.pluginName }));
});

const sensorTypeOptions = computed(() => {
  if (!sensorCameraId.value) return [];
  return getSensorTypes(sensorCameraId.value).map((sensor) => ({
    label: t(`components.camera_options.sensor_type_${sensor.value}`),
    value: sensor.value,
  }));
});

const cameraIdRef = computed(() => sensorCameraId.value || undefined);
const sensorTypeRef = computed(() => (sensorTypeValue.value as SensorType) || SensorType.Contact);
const { instanceOptions, isLoading: instancesLoading } = useSensorInstances(cameraIdRef, sensorTypeRef);

const instanceSelectOptions = computed(() =>
  instanceOptions.value.map((instance) => ({
    label: instance.label,
    value: `${instance.sensorName}::${instance.pluginId}`,
  })),
);

const selectedInstanceKey = computed(() => {
  const binding = props.modelValue as SensorBinding | undefined;
  if (!binding?.sensorName || !binding.sensorPluginId) return '';
  return `${binding.sensorName}::${binding.sensorPluginId}`;
});

function onInstanceChange(key: unknown) {
  const [sensorName, sensorPluginId] = String(key).split('::');
  emit('update:modelValue', { sensorType: sensorTypeValue.value, sensorName, sensorPluginId } satisfies SensorBinding);
}
</script>
