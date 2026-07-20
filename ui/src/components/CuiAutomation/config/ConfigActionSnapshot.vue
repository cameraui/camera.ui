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
        @update:model-value="update('cameraId', $event)"
      />
    </div>

    <div class="cui-toggle-switch">
      <div class="flex items-center gap-4">
        <div class="flex flex-col field-switch-gap">
          <label class="cui-label-switch">{{ t('components.automation_nodes.snapshot_force_new') }}</label>
          <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{
            t('components.automation_nodes.snapshot_force_new_hint')
          }}</Message>
        </div>
        <ToggleSwitch :model-value="data.forceNew" class="ml-auto shrink-0" @update:model-value="update('forceNew', $event)" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useCameraOptions } from './useCameraOptions.js';

import type { ConfigActionSnapshotProps, ConfigNodeUpdateEmits } from '../types.js';

defineProps<ConfigActionSnapshotProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();
const { cameraOptions } = useCameraOptions();

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}
</script>
