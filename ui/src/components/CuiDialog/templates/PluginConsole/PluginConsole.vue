<template>
  <div>
    <CuiConsole ref="consoleRef" :options class="bg-black !w-full" ignore-breakpoint />
  </div>
</template>

<script setup lang="ts">
import { PluginsQuery } from '@/api/routes/plugins.js';

import type CuiConsole from '@/components/CuiConsole/CuiConsole.vue';
import type { DialogRefProps } from '@/composables/useCuiDialog.js';
import type { ITerminalOptions } from '@xterm/xterm';
import type { PluginConsoleProps } from './types.js';

const pluginsQuery = new PluginsQuery();

const props = defineProps<PluginConsoleProps>();

const { mdBreakpoint } = useSharedCuiBreakpoint();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const { plugin, isInstalling } = toRefs(props);

const logsSocket = useLogsSocket({
  target: plugin.value.pluginName,
  onStdout: (data) => consoleRef.value?.writeTerminal(data),
  onDisconnect: () => consoleRef.value?.writeTerminal('\r\nWebsocket failed to connect! Is the server running?\r\n\r\n'),
  onClearLog: () => consoleRef.value?.clearTerminal(),
  onReconnected: () => {
    if (!isInstalling.value) {
      consoleRef.value?.clearTerminal();
      consoleRef.value?.writeTerminal('\r\n--- Reconnected ---\r\n\r\n');
    }
  },
});

const { data: logData, isBusy: downloadLogLoading, suspense: logSuspense } = pluginsQuery.downloadLogQuery(plugin.value.pluginName);

const consoleRef = useTemplateRef<InstanceType<typeof CuiConsole>>('consoleRef');

const isLoading = computed(() => Boolean(dialogRefProps.loading?.value || downloadLogLoading.value));

const options = computed<ITerminalOptions>(() => {
  return {
    fontSize: mdBreakpoint.value ? 12 : 14,
  };
});

async function onConfirm(): Promise<void> {
  try {
    pluginsQuery.toggleQueryActivator('downloadLogQuery', true);

    await logSuspense();

    if (logData.value) {
      await download({
        blob: new Blob([logData.value]),
        filename: `camera.ui.${plugin.value.pluginName}.log.txt`,
        mimeType: 'text/plain',
      });
    }
  } finally {
    pluginsQuery.toggleQueryActivator('downloadLogQuery', false);
  }
}

onMounted(() => {
  logsSocket.connect();

  if (!isInstalling.value) {
    logsSocket.requestPluginLog(plugin.value.pluginName, { sinceLastStart: true });
  }
});

onUnmounted(() => {
  logsSocket.disconnect();
});

defineExpose({
  isLoading,
  onConfirm,
});
</script>

<style scoped></style>
