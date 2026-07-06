<template>
  <div>
    <CuiConsole ref="consoleRef" :options class="bg-black !w-full" ignore-breakpoint />
  </div>
</template>

<script setup lang="ts">
import { CamerasQuery } from '@/api/routes/cameras.js';

import type CuiConsole from '@/components/CuiConsole/CuiConsole.vue';
import type { CustomDialogComponent, DialogRefProps } from '@/composables/useCuiDialog.js';
import type { ITerminalOptions } from '@xterm/xterm';
import type { CameraConsoleProps } from './types.js';

const camerasQuery = new CamerasQuery();

const props = defineProps<CameraConsoleProps>();

const { mdBreakpoint } = useSharedCuiBreakpoint();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const { cameraName } = toRefs(props);

const logsSocket = useLogsSocket({
  target: cameraName.value,
  onStdout: (data) => consoleRef.value?.writeTerminal(data),
  onDisconnect: () => consoleRef.value?.writeTerminal('\r\nWebsocket failed to connect! Is the server running?\r\n\r\n'),
  onClearLog: () => consoleRef.value?.clearTerminal(),
  onReconnected: () => {
    consoleRef.value?.clearTerminal();
    consoleRef.value?.writeTerminal('\r\n--- Reconnected ---\r\n\r\n');
  },
});

const { data: logData, isBusy: downloadLogLoading, suspense: logSuspense } = camerasQuery.downloadLogQuery(cameraName);

const consoleRef = useTemplateRef<InstanceType<typeof CuiConsole>>('consoleRef');

const isLoading = computed(() => Boolean(dialogRefProps.loading?.value || downloadLogLoading.value));

const options = computed<ITerminalOptions>(() => {
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
  logsSocket.connect();
  logsSocket.requestCameraLog(cameraName.value, { sinceLastStart: true });
});

onUnmounted(() => {
  logsSocket.disconnect();
});

defineExpose<CustomDialogComponent>({
  isLoading,
  onConfirm,
});
</script>

<style scoped></style>
