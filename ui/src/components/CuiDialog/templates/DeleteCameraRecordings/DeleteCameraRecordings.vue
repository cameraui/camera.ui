<template>
  <div class="flex flex-col gap-4">
    <span class="text-wrap">{{ $t('views.metrics.delete_recordings_confirm', { name: cameraName }) }}</span>
    <CuiToggleRow :label="$t('views.metrics.delete_recordings_events')" :hint="$t('views.metrics.delete_recordings_events_hint')" label-for="deleteRecordingsEvents">
      <ToggleSwitch v-model="withEvents" input-id="deleteRecordingsEvents" />
    </CuiToggleRow>
  </div>
</template>

<script setup lang="ts">
import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { DeleteCameraRecordingsProps } from './types.js';

defineProps<DeleteCameraRecordingsProps>();

const withEvents = ref(false);

defineExpose<CustomDialogComponent>({
  onConfirm: async () => withEvents.value,
});
</script>
