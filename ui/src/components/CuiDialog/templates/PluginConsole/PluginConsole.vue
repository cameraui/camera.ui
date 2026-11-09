<template>
  <div>
    <CuiLogConsole ref="consoleRef" :options class="bg-black" ignore-breakpoint @resize="reportSize" />
  </div>
</template>

<script setup lang="ts">
import { PluginsQuery } from '@/api/routes/plugins.js';

import type CuiLogConsole from '@/components/CuiLogConsole/CuiLogConsole.vue';
import type { DialogRefProps } from '@/composables/useCuiDialog.js';
import type { ITerminalOptions } from '@xterm/xterm';
import type { PluginConsoleProps } from './types.js';

const pluginsQuery = new PluginsQuery();

const props = defineProps<PluginConsoleProps>();

const { mdBreakpoint } = useSharedCuiBreakpoint();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;
const logsChannel = useSocket('/logs');

const { plugin } = toRefs(props);

useInstallProgressDialog(() => plugin.value.pluginName);

const { data: logData, isBusy: downloadLogLoading, suspense: logSuspense } = pluginsQuery.downloadLogQuery(plugin.value.pluginName);

const consoleRef = useTemplateRef<InstanceType<typeof CuiLogConsole>>('consoleRef');

const isLoading = computed(() => Boolean(dialogRefProps.loading?.value || downloadLogLoading.value));

const options = computed<Partial<ITerminalOptions>>(() => {
  return {
    fontSize: mdBreakpoint.value ? 12 : 14,
  };
});

function reportSize(cols: number): void {
  // update and install output wraps to the width of the view showing it
  if (cols > 0) logsChannel.emit('term-size', { target: plugin.value.pluginName, cols });
}

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
  consoleRef.value?.show(`plugin:${plugin.value.id}`);
});

defineExpose({
  isLoading,
  onConfirm,
});
</script>
