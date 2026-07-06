<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.system_category') }}</label>
      <Select :model-value="data.category" :options="categories" option-label="label" option-value="value" class="w-full" @update:model-value="onCategoryChange" />
    </div>

    <div v-if="data.category === 'plugin'" class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.plugin_name') }}</label>
      <Select
        :model-value="data.targetId"
        :options="pluginOptions"
        option-label="label"
        option-value="value"
        :placeholder="t('components.automation_nodes.plugin_name_placeholder')"
        :loading="pluginsLoading"
        class="w-full"
        @update:model-value="onTargetChange"
      />
    </div>

    <div v-if="data.category === 'camera'" class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.camera') }}</label>
      <Select
        :model-value="data.targetId"
        :options="cameraOptions"
        option-label="label"
        option-value="value"
        :placeholder="t('components.automation_nodes.camera_placeholder')"
        class="w-full"
        @update:model-value="onTargetChange"
      />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.system_event_type') }}</label>
      <Select
        :model-value="data.eventType"
        :options="eventOptions"
        option-label="label"
        option-value="value"
        :placeholder="t('components.automation_nodes.system_event_placeholder')"
        :disabled="data.category !== 'system' && !data.targetId"
        class="w-full"
        @update:model-value="update('eventType', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { PluginsQuery } from '@/api/routes/plugins.js';
import { useCameraOptions } from './useCameraOptions.js';

import type { ConfigNodeUpdateEmits, ConfigTriggerSystemProps } from '../types.js';

const pluginsQuery = new PluginsQuery();

const props = defineProps<ConfigTriggerSystemProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();

const { cameraOptions } = useCameraOptions();

const { data: pluginsData, isBusy: pluginsLoading } = pluginsQuery.getPluginsQuery({ page: 1, pageSize: -1 });

const pluginOptions = computed(() => {
  if (!pluginsData.value?.result) return [];
  return pluginsData.value.result.map((p) => ({
    label: p.pluginName,
    value: p.id,
  }));
});

const categories = computed(() => [
  { label: t('components.automation_nodes.system_cat_system'), value: 'system' },
  { label: t('components.automation_nodes.system_cat_plugin'), value: 'plugin' },
  { label: t('components.automation_nodes.system_cat_camera'), value: 'camera' },
]);

const eventOptions = computed(() => {
  switch (props.data.category) {
    case 'system':
      return systemEvents();
    case 'plugin':
      return pluginEvents();
    case 'camera':
      return cameraEvents();
    default:
      return [];
  }
});

function systemEvents() {
  return [
    { label: t('components.automation_nodes.system_evt_started'), value: 'system:started' },
    { label: t('components.automation_nodes.system_evt_shutdown'), value: 'system:shutdown' },
    { label: t('components.automation_nodes.system_evt_camera_added'), value: 'camera:added' },
    { label: t('components.automation_nodes.system_evt_camera_removed'), value: 'camera:removed' },
  ];
}

function pluginEvents() {
  return [
    { label: t('components.automation_nodes.system_evt_plugin_started'), value: 'plugin:started' },
    { label: t('components.automation_nodes.system_evt_plugin_stopped'), value: 'plugin:stopped' },
    { label: t('components.automation_nodes.system_evt_plugin_error'), value: 'plugin:error' },
  ];
}

function cameraEvents() {
  return [
    { label: t('components.automation_nodes.system_evt_camera_connected'), value: 'camera:connected' },
    { label: t('components.automation_nodes.system_evt_camera_disconnected'), value: 'camera:disconnected' },
    { label: t('components.automation_nodes.system_evt_fw_started'), value: 'camera:frameworker:started' },
    { label: t('components.automation_nodes.system_evt_fw_stopped'), value: 'camera:frameworker:stopped' },
    { label: t('components.automation_nodes.system_evt_property_changed'), value: 'camera:property:changed' },
    { label: t('components.automation_nodes.system_evt_sensor_added'), value: 'sensor:added' },
    { label: t('components.automation_nodes.system_evt_sensor_removed'), value: 'sensor:removed' },
  ];
}

function onCategoryChange(value: unknown) {
  emit('update:data', { category: value, eventType: '', targetId: '' });
}

function onTargetChange(value: unknown) {
  emit('update:data', { targetId: value, eventType: '' });
}

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}
</script>
