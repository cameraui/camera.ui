<template>
  <div class="flex flex-col gap-2 w-full">
    <label for="sensorDisplayName" class="cui-label">{{ $t('components.camera_options.sensor_display_name') }}</label>
    <InputText id="sensorDisplayName" v-model="displayName" class="w-full" autofocus />
  </div>
</template>

<script setup lang="ts">
import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { RenameSensorProps } from './types.js';

const props = defineProps<RenameSensorProps>();

const displayName = ref(props.currentDisplayName);

defineExpose<CustomDialogComponent>({
  onConfirm: async () => {
    const trimmed = displayName.value.trim();
    if (!trimmed) return null;
    return trimmed;
  },
});
</script>
