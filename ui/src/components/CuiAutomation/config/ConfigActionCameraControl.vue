<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.camera') }}</label>
      <Select
        :model-value="data.cameraId"
        :options="cameraOptions"
        option-label="label"
        option-value="value"
        :placeholder="t('components.automation_nodes.camera_select')"
        class="w-full"
        @update:model-value="update('cameraId', $event)"
      />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.camera_control_properties') }}</label>
      <span class="text-xs text-muted">{{ t('components.automation_nodes.camera_control_properties_hint') }}</span>
    </div>

    <div v-for="def in CAMERA_CONTROL_PROPERTY_DEFINITIONS" :key="def.key" class="flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <Checkbox :model-value="isEnabled(def.key)" binary @update:model-value="toggleProperty(def.key, $event)" />
        <label class="cui-label-switch cursor-pointer flex-1 min-w-0 truncate" @click="toggleProperty(def.key, !isEnabled(def.key))">{{ t(def.labelKey) }}</label>
        <ToggleSwitch
          v-if="isEnabled(def.key) && def.inputType === 'boolean'"
          :model-value="getPropertyValue(def.key) === 'true'"
          class="shrink-0"
          @update:model-value="setPropertyValue(def.key, String($event))"
        />
      </div>

      <div v-if="isEnabled(def.key) && def.inputType !== 'boolean'" class="pl-7">
        <Select
          v-if="def.inputType === 'select'"
          :model-value="getPropertyValue(def.key)"
          :options="def.options"
          option-label="label"
          option-value="value"
          class="w-full"
          @update:model-value="setPropertyValue(def.key, $event)"
        />
        <InputNumber
          v-else-if="def.inputType === 'number'"
          :model-value="Number(getPropertyValue(def.key)) || def.min"
          :min="def.min"
          :max="def.max"
          :step="def.step ?? 1"
          :min-fraction-digits="def.step && def.step < 1 ? 2 : 0"
          :max-fraction-digits="def.step && def.step < 1 ? 2 : 0"
          class="w-full"
          @update:model-value="setPropertyValue(def.key, String($event))"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useCameraOptions } from './useCameraOptions.js';

import { CAMERA_CONTROL_PROPERTY_DEFINITIONS } from '../types.js';

import type { ConfigActionCameraControlProps, ConfigNodeUpdateEmits } from '../types.js';

const props = defineProps<ConfigActionCameraControlProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();
const { cameraOptions } = useCameraOptions();

function isEnabled(key: string): boolean {
  return props.data.properties.some((p) => p.property === key);
}

function getPropertyValue(key: string): string {
  return props.data.properties.find((p) => p.property === key)?.value ?? '';
}

function toggleProperty(key: string, enabled: unknown): void {
  const properties = [...props.data.properties];
  if (enabled) {
    if (!properties.some((p) => p.property === key)) {
      const def = CAMERA_CONTROL_PROPERTY_DEFINITIONS.find((d) => d.key === key);
      properties.push({ property: key, value: def?.defaultValue ?? '' });
    }
  } else {
    const idx = properties.findIndex((p) => p.property === key);
    if (idx >= 0) properties.splice(idx, 1);
  }
  emit('update:data', { properties });
}

function setPropertyValue(key: string, value: string): void {
  const properties = props.data.properties.map((p) => (p.property === key ? { ...p, value } : p));
  emit('update:data', { properties });
}

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}
</script>
