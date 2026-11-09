<template>
  <div>
    <CuiLogConsole ref="consoleRef" :options class="bg-black" ignore-breakpoint />
  </div>
</template>

<script setup lang="ts">
import { CamerasQuery } from '@/api/routes/cameras.js';

import type CuiLogConsole from '@/components/CuiLogConsole/CuiLogConsole.vue';
import type { CustomDialogComponent, DialogRefProps } from '@/composables/useCuiDialog.js';
import type { ITerminalOptions } from '@xterm/xterm';
import type { CameraConsoleProps } from './types.js';

const camerasQuery = new CamerasQuery();

const props = defineProps<CameraConsoleProps>();

const { mdBreakpoint } = useSharedCuiBreakpoint();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const { cameraId, cameraName } = toRefs(props);

const { data: logData, isBusy: downloadLogLoading, suspense: logSuspense } = camerasQuery.downloadLogQuery(cameraName);

const consoleRef = useTemplateRef<InstanceType<typeof CuiLogConsole>>('consoleRef');

const isLoading = computed(() => Boolean(dialogRefProps.loading?.value || downloadLogLoading.value));

const options = computed<Partial<ITerminalOptions>>(() => {
  return {
    fontSize: mdBreakpoint.value ? 12 : 14,
  };
});

async function onConfirm(): Promise<void> {
  try {
    camerasQuery.toggleQueryActivator('downloadLogQuery', true);

    await logSuspense();

    if (logData.value) {
      await download({
        blob: new Blob([logData.value]),
        filename: `camera.ui.${cameraName.value}.log.txt`,
        mimeType: 'text/plain',
      });
    }
  } finally {
    camerasQuery.toggleQueryActivator('downloadLogQuery', false);
  }
}

onMounted(() => {
  consoleRef.value?.show(`camera:${cameraId.value}`);
});

defineExpose<CustomDialogComponent>({
  isLoading,
  onConfirm,
});
</script>
