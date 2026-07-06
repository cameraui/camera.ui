<template>
  <div class="h-full w-full relative">
    <CuiTopbarSlot position="left">
      <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="$router.back()">
        <template #icon>
          <i-weui:back-filled class="w-6 h-6" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <CuiTopNavbar :left-offset="navbarOffset" scrollable animate>
      <template v-if="mobileSearchActive" #full>
        <CuiTopNavbarItem class="sm:hidden" @click="closeMobileSearch">
          <template #icon>
            <i-carbon:arrow-left class="text-sm" />
          </template>
        </CuiTopNavbarItem>
        <IconField class="w-full sm:hidden">
          <InputIcon>
            <i-carbon:search class="text-sm" />
          </InputIcon>
          <InputText ref="mobileSearchInput" v-model="filter" :placeholder="$t('components.form.placeholder.search')" class="text-xs h-8 w-full" />
        </IconField>
      </template>

      <template v-if="!mobileSearchActive" #left>
        <CuiTopNavbarItem v-for="lvl in levelToggles" :key="lvl" type="button" :label="lvl" :active="activeLevels.has(lvl)" @click="toggleLevel(lvl)" />
      </template>

      <template v-if="!mobileSearchActive" #right>
        <CuiTopNavbarItem class="sm:hidden" @click="openMobileSearch">
          <template #icon>
            <i-carbon:search class="text-sm" />
          </template>
        </CuiTopNavbarItem>

        <IconField class="hidden sm:flex">
          <InputIcon>
            <i-carbon:search class="text-sm" />
          </InputIcon>
          <InputText v-model="filter" :placeholder="$t('components.form.placeholder.search')" class="text-xs h-8 w-40" />
        </IconField>

        <CuiTopNavbarItem v-tooltip="{ value: $t('views.console.copy') }" @click="copy">
          <template #icon>
            <i-lucide:copy class="text-sm" />
          </template>
        </CuiTopNavbarItem>
        <CuiTopNavbarItem v-tooltip="{ value: $t('views.console.export') }" @click="exportLogs">
          <template #icon>
            <i-lucide:download class="text-sm" />
          </template>
        </CuiTopNavbarItem>
        <CuiTopNavbarItem v-tooltip="{ value: $t('views.console.clear') }" @click="clear">
          <template #icon>
            <i-lucide:trash-2 class="text-sm" />
          </template>
        </CuiTopNavbarItem>
      </template>
    </CuiTopNavbar>

    <div class="w-full h-full flex flex-col" :style="{ paddingTop: `${TOPNAVBAR_HEIGHT}px` }">
      <div ref="scrollEl" class="flex-1 min-h-0 overflow-auto p-2 font-mono text-[11px] leading-snug">
        <div v-if="!filtered.length" class="text-muted p-4 text-center">
          {{ recording ? $t('views.console.empty') : $t('views.console.recording_off') }}
        </div>
        <div v-for="(e, i) in filtered" :key="i" class="whitespace-pre-wrap break-words py-0.5 border-b border-white/5" :class="levelClass(e.level)">
          <span class="text-muted">{{ time(e.t) }}</span>
          <span class="opacity-70"> [{{ e.level.toUpperCase() }}] [{{ e.scope }}]</span>
          {{ e.msg }}
        </div>
      </div>
    </div>

    <Button
      v-tooltip="{ value: $t('views.console.refresh') }"
      severity="secondary"
      rounded
      class="absolute right-3 bottom-3 z-11 opacity-60 hover:opacity-100 transition"
      @click="refresh"
    >
      <template #icon>
        <i-lucide:refresh-cw class="text-sm" />
      </template>
    </Button>
  </div>
</template>

<script setup lang="ts">
import { buildExport, Logger } from '@camera.ui/logger';
import { Capacitor } from '@capacitor/core';

import { TOPNAVBAR_HEIGHT } from '@/components/CuiTopNavbar/types.js';

import type { LogEntry, LogLevel } from '@camera.ui/logger';

const props = withDefaults(
  defineProps<{
    navbarWidth?: number;
    navbarLeft?: number;
  }>(),
  {
    navbarWidth: 0,
    navbarLeft: 0,
  },
);

const toast = useCuiToast();
const { t } = useI18n();
const { registerScrollToTop } = useCuiTopbarSlots();

const { navbarWidth, navbarLeft } = toRefs(props);
const navbarOffset = computed(() => navbarWidth.value + navbarLeft.value);

const entries = ref<LogEntry[]>([]);
const filter = ref('');
const levelToggles: LogLevel[] = ['debug', 'log', 'info', 'warn', 'error'];
const activeLevels = ref(new Set<LogLevel>(levelToggles));
const scrollEl = ref<HTMLElement | null>(null);
const mobileSearchActive = ref(false);
const mobileSearchInput = useTemplateRef<{ $el: HTMLElement }>('mobileSearchInput');

const recording = ref(Logger.isRecording());

let offEntries: (() => void) | undefined;
let offFlags: (() => void) | undefined;

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase();
  return entries.value.filter((e) => {
    if (!activeLevels.value.has(e.level)) return false;
    if (q && !e.msg.toLowerCase().includes(q)) return false;
    return true;
  });
});

function time(t: number): string {
  const d = new Date(t);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

function levelClass(level: LogLevel): string {
  if (level === 'error') return 'text-red-400';
  if (level === 'warn') return 'text-amber-400';
  if (level === 'debug') return 'text-sky-400';
  return 'text-color';
}

function toggleLevel(level: LogLevel): void {
  const next = new Set(activeLevels.value);
  if (next.has(level)) next.delete(level);
  else next.add(level);
  activeLevels.value = next;
}

function openMobileSearch(): void {
  mobileSearchActive.value = true;
  nextTick(() => mobileSearchInput.value?.$el?.querySelector('input')?.focus());
}

function closeMobileSearch(): void {
  mobileSearchActive.value = false;
  filter.value = '';
}

async function scrollToBottom(): Promise<void> {
  await nextTick();
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
}

// Tapping the topbar title scrolls the log back to the top.
function scrollToTop(): void {
  scrollEl.value?.scrollTo({ top: 0, behavior: 'smooth' });
}
registerScrollToTop(scrollToTop);

function refresh(): void {
  entries.value = Logger.entries();
  scrollToBottom();
}

function diagnosticContext(): Record<string, unknown> {
  return {
    platform: Capacitor.getPlatform(),
    userAgent: navigator.userAgent,
    url: window.location.href,
    generatedAt: new Date().toISOString(),
  };
}

function buildText(): string {
  return buildExport({ entries: filtered.value, context: diagnosticContext() });
}

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(buildText());
    toast.add({ severity: 'success', summary: t('views.console.copied') });
  } catch (err) {
    toast.add({ severity: 'error', summary: t('views.console.copy_failed'), detail: err });
  }
}

async function exportLogs(): Promise<void> {
  const blob = new Blob([buildText()], { type: 'text/plain' });
  await download({ blob, filename: `camera-ui-logs-${Date.now()}.txt`, mimeType: 'text/plain' });
}

function clear(): void {
  Logger.clear();
  toast.add({ severity: 'success', summary: t('views.console.cleared') });
}

onMounted(() => {
  entries.value = Logger.entries();
  scrollToBottom();
  offEntries = Logger.onEntries((list) => {
    entries.value = list.slice();
  });
  offFlags = Logger.onChange(() => {
    recording.value = Logger.isRecording();
  });
});

onUnmounted(() => {
  offEntries?.();
  offFlags?.();
});
</script>
