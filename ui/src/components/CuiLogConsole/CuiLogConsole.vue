<template>
  <div class="relative w-full h-full flex">
    <CuiConsole ref="consoleRef" :options :ignore-breakpoint @resize="(cols: number) => emit('resize', cols)" />

    <div v-if="history.gone.value" class="absolute top-2 left-3 right-3 z-11 flex justify-center pointer-events-none">
      <Message severity="warn" size="small" class="pointer-events-auto">{{ goneText }}</Message>
    </div>

    <div v-else-if="topNote" class="absolute top-2 left-0 right-0 z-11 flex justify-center pointer-events-none">
      <ProgressSpinner v-if="history.loadingOlder.value" stroke-width="5" class="w-6 h-6" />
      <span v-else class="text-xs text-muted bg-black/50 rounded-full px-3 py-1">{{ $t('views.logs.beginning') }}</span>
    </div>

    <div v-if="history.notFound.value" class="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <span class="text-sm text-muted">{{ $t('views.logs.not_found') }}</span>
    </div>

    <Transition name="fade-2">
      <Button
        v-if="history.newLines.value > 0 && !consoleRef?.atBottom"
        rounded
        class="cui-button-small absolute bottom-3 left-1/2 -translate-x-1/2 z-11 shadow-md"
        :label="$t('views.logs.new_lines', { count: history.newLines.value }, history.newLines.value)"
        @click="history.jumpToEnd"
      >
        <template #icon>
          <i-mdi:arrow-down class="w-4 h-4" />
        </template>
      </Button>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { CUI_LOG_CONSOLE_DEFAULTS } from './types.js';

import type CuiConsole from '@/components/CuiConsole/CuiConsole.vue';
import type { CuiLogConsoleEmits, CuiLogConsoleProps } from './types.js';

const props = withDefaults(defineProps<CuiLogConsoleProps>(), CUI_LOG_CONSOLE_DEFAULTS);

const emit = defineEmits<CuiLogConsoleEmits>();

const { t, locale } = useI18n();
const toast = useCuiToast();

const consoleRef = useTemplateRef<InstanceType<typeof CuiConsole>>('consoleRef');

const history = useLogHistory({ view: () => consoleRef.value, search: toRef(props, 'search') });

const atBottom = computed(() => consoleRef.value?.atBottom ?? true);

const goneText = computed(() => {
  const firstAt = history.gone.value?.firstAt;
  return firstAt
    ? t('views.logs.gone_since', { time: new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'medium' }).format(firstAt) })
    : t('views.logs.gone');
});

const topNote = computed(() => history.loadingOlder.value || (history.atBeginning.value && consoleRef.value?.atTop && !consoleRef.value?.atBottom));

watch(
  () => consoleRef.value?.atTop,
  (top) => {
    if (top) history.reachedTop();
  },
);

watch(
  () => consoleRef.value?.atBottom,
  (bottom) => {
    if (bottom) history.reachedBottom();
  },
);

watch(history.failed, (failed) => {
  if (!failed) return;
  toast.add({ severity: 'error', detail: t('views.logs.load_failed'), life: 3000 });
  history.failed.value = false;
});

defineExpose({
  atBottom,
  show: history.show,
  jumpToEnd: history.jumpToEnd,
  copyAll: () => consoleRef.value?.copyAll(),
});
</script>
