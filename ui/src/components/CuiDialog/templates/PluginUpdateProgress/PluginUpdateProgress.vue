<template>
  <div class="w-full h-full flex flex-col gap-3">
    <div v-if="run?.status === 'error'" class="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 shrink-0">
      <i-mdi:alert-circle class="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
      <span class="text-sm text-red-400 break-all">{{ run.error }}</span>
    </div>

    <div class="w-full flex-1 min-h-0 relative">
      <CuiConsole ref="consoleRef" :options="options" class="bg-black !w-full" ignore-breakpoint />
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePluginUpdates } from '@/composables/usePluginUpdates.js';

import type CuiConsole from '@/components/CuiConsole/CuiConsole.vue';
import type { ITerminalOptions } from '@xterm/xterm';
import type { PluginUpdateProgressProps } from './types.js';

const props = defineProps<PluginUpdateProgressProps>();

const { mdBreakpoint } = useSharedCuiBreakpoint();
const { runOf } = usePluginUpdates();

useInstallProgressDialog(() => props.pluginName);

const consoleRef = useTemplateRef<InstanceType<typeof CuiConsole>>('consoleRef');

let written = 0;

const run = computed(() => runOf(props.pluginName));

const options = computed<ITerminalOptions>(() => ({
  fontSize: mdBreakpoint.value ? 12 : 14,
}));

function flush(): void {
  const lines = run.value?.lines ?? [];
  for (; written < lines.length; written++) {
    consoleRef.value?.writeTerminal(lines[written]);
  }
}

watch(
  () => run.value?.lines.length,
  () => flush(),
);

onMounted(async () => {
  await nextTick();
  flush();
});
</script>

<style scoped></style>
