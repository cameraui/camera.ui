<template>
  <div class="h-full w-full dark-mode relative">
    <CuiTopbarSlot position="left">
      <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="$router.push('/menu')">
        <template #icon>
          <i-weui:back-filled class="w-6 h-6" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <CuiTopNavbar :left-offset="navbarOffset" animate>
      <template v-if="mobileSearchActive" #full>
        <CuiTopNavbarItem class="sm:hidden" @click="closeMobileSearch">
          <template #icon>
            <i-carbon:arrow-left class="text-sm" />
          </template>
        </CuiTopNavbarItem>
        <IconField class="dark-mode w-full sm:hidden">
          <InputIcon>
            <i-carbon:search class="text-sm" />
          </InputIcon>
          <InputText ref="mobileSearchInput" v-model="searchQuery" :placeholder="t('components.form.placeholder.search')" class="dark-mode text-xs h-8 w-full" />
        </IconField>
      </template>

      <template v-if="!mobileSearchActive" #left>
        <CuiTopNavbarItem type="dropdown" :label="currentSourceLabel" :menu-open="menuRef?.isOpen" @click="(e) => menuRef?.toggleMenu(e)" />
      </template>

      <template v-if="!mobileSearchActive" #right>
        <CuiTopNavbarItem class="sm:hidden" @click="openMobileSearch">
          <template #icon>
            <i-carbon:search class="text-sm" />
          </template>
        </CuiTopNavbarItem>

        <IconField class="dark-mode hidden sm:flex">
          <InputIcon>
            <i-carbon:search class="text-sm" />
          </InputIcon>
          <InputText v-model="searchQuery" :placeholder="t('components.form.placeholder.search')" class="dark-mode text-xs h-8 w-40" />
        </IconField>
      </template>
    </CuiTopNavbar>

    <div
      class="w-full h-full flex relative"
      :style="{
        paddingTop: `${TOPNAVBAR_HEIGHT}px`,
      }"
    >
      <CuiConsole ref="consoleRef" :options />
    </div>

    <SpeedDial
      :model="items"
      direction="up"
      :transition-delay="80"
      :tooltip-options="{ position: 'left', event: undefined }"
      class="absolute right-3 bottom-3 z-11"
      :pt="{ root: { style: 'pointer-events: none' } }"
    >
      <template #button="{ visible, toggleCallback }">
        <Button
          severity="secondary"
          class="dark-mode opacity-40 hover:opacity-100 active:opacity-100 focus:opacity-100 transition pointer-events-auto"
          :class="{
            'opacity-100': visible,
          }"
          rounded
          :loading="isLoading"
          @click="toggleCallback"
        >
          <template #icon>
            <div class="relative w-6 h-6">
              <div
                class="absolute top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full transform transition-all duration-100 origin-center"
                :class="{
                  'w-4 h-[2px] rotate-45 top-1/2 -translate-y-1/2 rounded-none': visible,
                }"
                :style="{
                  backgroundColor: 'var(--text-color)',
                }"
              />
              <div
                class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full transition-all duration-100"
                :class="{
                  'opacity-0 scale-0': visible,
                }"
                :style="{
                  backgroundColor: 'var(--text-color)',
                }"
              />
              <div
                class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full transform transition-all duration-100 origin-center"
                :class="{
                  'w-4 h-[2px] -rotate-45 bottom-1/2 translate-y-1/2 rounded-none': visible,
                }"
                :style="{
                  backgroundColor: 'var(--text-color)',
                }"
              />
            </div>
          </template>
        </Button>
      </template>
      <template #item="{ item, toggleCallback }">
        <Button v-tooltip="{ value: item.label }" :loading="isLoading" severity="secondary" v-bind="item.buttonProps" rounded @click="toggleCallback">
          <template #icon>
            <component :is="item.icon" />
          </template>
        </Button>
      </template>
    </SpeedDial>

    <Button
      class="dark-mode opacity-40 transition absolute bottom-3 right-14 z-11 text-white"
      :class="{
        '!opacity-20': consoleRef?.atBottom,
        'hover:opacity-100 active:opacity-100 focus:opacity-100': !consoleRef?.atBottom,
      }"
      rounded
      :loading="isLoading"
      :disabled="consoleRef?.atBottom"
      @click="consoleRef?.scrollToBottom"
    >
      <template #icon>
        <i-carbon:down-to-bottom class="text-white" />
      </template>
    </Button>

    <CuiMenu
      ref="menuRef"
      :items="sourceItems"
      dividers="sections"
      max-height="300px"
      class="dark-mode"
      :popover="{
        pt: {
          content: {
            class: 'p-0! rounded-xl! overflow-hidden!',
          },
        },
      }"
    />
  </div>
</template>

<script setup lang="ts">
import DownloadIcon from '~icons/heroicons-solid/download';
import TrashIcon from '~icons/lucide/trash-2';
import ZoomInIcon from '~icons/tabler/zoom-in';
import ZoomOutIcon from '~icons/tabler/zoom-out';

import { CamerasQuery, clearLogFn as clearCameraLogFn, downloadLogFn as downloadCameraLogFn } from '@/api/routes/cameras.js';
import { clearLogFn as clearPluginLogFn, downloadLogFn as downloadPluginLogFn, PluginsQuery } from '@/api/routes/plugins.js';
import { clearLogFn as clearServerLogFn, downloadLogFn as downloadServerLogFn } from '@/api/routes/server.js';
import CuiConsole from '@/components/CuiConsole/CuiConsole.vue';
import { TOPNAVBAR_HEIGHT } from '@/components/CuiTopNavbar/types.js';

import type CuiMenu from '@/components/CuiMenu/CuiMenu.vue';
import type { MenuItem } from '@/components/CuiMenu/types.js';
import type { LogSource } from '@/composables/sockets/useLogsSocket.js';
import type { ITerminalInitOnlyOptions, ITerminalOptions } from '@xterm/xterm';
import type { ButtonProps } from 'primevue';

const camerasQuery = new CamerasQuery();
const pluginsQuery = new PluginsQuery();

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

const { t } = useI18n();
const dialog = useCuiDialog();
const toast = useCuiToast();

const uiStore = useUiStore();
const { uiSettings } = storeToRefs(uiStore);

const { data: cameras } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });
const { data: plugins } = pluginsQuery.getPluginsQuery({ page: 1, pageSize: -1 });

const MAX_BUFFER_SIZE = 5000;
const SYSTEM_SOURCES: { id: string; label: string }[] = [
  { id: 'server', label: 'Server' },
  { id: 'go2rtc', label: 'go2rtc' },
  { id: 'nats', label: 'nats' },
  { id: 'tunnel', label: 'tunnel' },
];

const { navbarWidth, navbarLeft } = toRefs(props);
const consoleRef = useTemplateRef<InstanceType<typeof CuiConsole>>('consoleRef');
const menuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('menuRef');
const mobileSearchInput = useTemplateRef<{ $el: HTMLElement }>('mobileSearchInput');
const activeSource = ref<LogSource>({ kind: 'all' });
const searchQuery = ref('');
const logBuffer = ref<string[]>([]);
const mobileSearchActive = ref(false);
const isLoading = ref(false);

const navbarOffset = computed(() => navbarWidth.value + navbarLeft.value);

const activeSourceKey = computed(() => (activeSource.value.kind === 'all' ? 'all' : activeSource.value.id));

const currentSourceLabel = computed(() => {
  const source = activeSource.value;
  if (source.kind === 'all') return 'All';
  if (source.kind === 'system') return SYSTEM_SOURCES.find((system) => system.id === source.id)?.label ?? source.id ?? '';
  return source.id ?? '';
});

const sourceItems = computed<MenuItem[]>(() => {
  const list: MenuItem[] = [];

  const entry = (source: LogSource, label: string, group?: string): MenuItem => ({
    key: `${source.kind}:${source.id ?? ''}`,
    label,
    group,
    active: isActiveSource(source),
    onClick: () => switchTo(source),
  });

  list.push(entry({ kind: 'all' }, 'All'));

  for (const system of SYSTEM_SOURCES) {
    list.push(entry({ kind: 'system', id: system.id }, system.label, t('views.logs.groups.system')));
  }

  const pluginGroup = t('views.logs.groups.plugins');
  for (const plugin of plugins.value?.result ?? []) {
    list.push(entry({ kind: 'plugin', id: plugin.pluginName }, plugin.pluginName, pluginGroup));
  }

  const cameraGroup = t('views.logs.groups.cameras');
  for (const camera of cameras.value?.result ?? []) {
    list.push(entry({ kind: 'camera', id: camera.name }, camera.name, cameraGroup));
  }

  return list;
});

const options = computed<ITerminalOptions & ITerminalInitOnlyOptions>(() => {
  return {
    fontSize: uiSettings.value.console.zoom,
  };
});

function openMobileSearch(): void {
  mobileSearchActive.value = true;
  nextTick(() => {
    mobileSearchInput.value?.$el?.focus();
  });
}

function closeMobileSearch(): void {
  mobileSearchActive.value = false;
  searchQuery.value = '';
}

function matchesSearch(line: string, query: string): boolean {
  if (!query.trim()) return true;
  const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '');
  return cleanLine.toLowerCase().includes(query.toLowerCase());
}

function resetView(): void {
  logBuffer.value = [];
  consoleRef.value?.clearTerminal();
}

function applySearch(): void {
  if (!consoleRef.value) return;

  consoleRef.value.clearTerminal();
  for (const line of logBuffer.value) {
    if (matchesSearch(line, searchQuery.value)) {
      consoleRef.value.writeTerminal(line);
    }
  }
}

const debouncedApplySearch = useDebounceFn(applySearch, 300);

function isActiveSource(source: LogSource): boolean {
  return activeSource.value.kind === source.kind && activeSource.value.id === source.id;
}

function switchTo(source: LogSource): void {
  activeSource.value = source;
  resetView();
  logsSocket.switchSource(source);
}

const logsSocket = useLogsSocket({
  onStdout: (data) => {
    const lines = data.split(/(?<=\r?\n)/);
    for (const line of lines) {
      if (line.trim()) {
        logBuffer.value.push(line);
      }
    }

    if (logBuffer.value.length > MAX_BUFFER_SIZE) {
      logBuffer.value = logBuffer.value.slice(-MAX_BUFFER_SIZE);
    }

    if (matchesSearch(data, searchQuery.value)) {
      consoleRef.value?.writeTerminal(data);
    }
  },
  onDisconnect: () => consoleRef.value?.writeTerminal('\r\nWebsocket failed to connect! Is the server running?\r\n\r\n'),
  onClearLog: (source) => {
    // Per-source clears only reset the view that is actually looking at that source.
    if (source === activeSourceKey.value) {
      resetView();
    }
  },
  onReconnected: () => {
    resetView();
    consoleRef.value?.writeTerminal('--- Reconnected ---\r\n\r\n');
  },
});

async function clearLog(): Promise<void> {
  isLoading.value = true;
  try {
    const source = activeSource.value;
    if (source.kind === 'camera' && source.id) {
      await clearCameraLogFn({ cameraname: source.id });
      resetView();
    } else if (source.kind === 'plugin' && source.id) {
      await clearPluginLogFn({ pluginName: source.id });
      resetView();
    } else {
      // Server truncates + broadcasts clear-log, which resets the view via onClearLog.
      await clearServerLogFn(source.kind === 'system' ? source.id : undefined);
    }
    toast.add({ severity: 'success', detail: t('components.toast.log_cleared'), life: 3000 });
  } finally {
    isLoading.value = false;
  }
}

async function downloadLog(): Promise<void> {
  isLoading.value = true;
  try {
    const source = activeSource.value;
    const controller = new AbortController();

    let part: BlobPart;
    let filename: string;

    if (source.kind === 'camera' && source.id) {
      part = await downloadCameraLogFn({ cameraname: source.id, signal: controller.signal });
      filename = `camera.ui.${source.id}.log.txt`;
    } else if (source.kind === 'plugin' && source.id) {
      part = await downloadPluginLogFn({ pluginName: source.id, signal: controller.signal });
      filename = `camera.ui.${source.id}.log.txt`;
    } else {
      const src = source.kind === 'system' ? source.id : 'all';
      part = await downloadServerLogFn({ signal: controller.signal, source: src });
      filename = src && src !== 'all' ? `${src}.log.txt` : 'camera.ui.log.txt';
    }

    await download({
      blob: new Blob([part]),
      filename,
      mimeType: 'text/plain',
    });
  } finally {
    isLoading.value = false;
  }
}

function zoomIn(): void {
  if (uiSettings.value.console.zoom === 20) {
    return;
  }

  uiSettings.value.console.zoom++;
}

function zoomOut(): void {
  if (uiSettings.value.console.zoom === 8) {
    return;
  }

  uiSettings.value.console.zoom--;
}

const items = ref<{ label: string; icon: any; buttonProps?: ButtonProps; command: () => void }[]>([
  {
    label: t('components.form.tooltip.download'),
    icon: DownloadIcon,
    buttonProps: {
      severity: 'success',
    },
    command: () => {
      downloadLog();
    },
  },
  {
    label: t('components.form.tooltip.delete'),
    icon: TrashIcon,
    buttonProps: {
      severity: 'danger',
    },
    command: () => {
      dialog.openTextDialog({
        data: {
          title: t('components.dialog.title.confirm'),
          contentText: t('components.dialog.message.confirm_clear_log'),
          confirmText: t('components.form.button.clear'),
          confirmButtonProps: {
            severity: 'danger',
          },
        },
        onConfirm: clearLog,
      });
    },
  },
  {
    label: t('components.form.tooltip.zoom_out'),
    icon: ZoomOutIcon,
    command: () => {
      zoomOut();
    },
  },
  {
    label: t('components.form.tooltip.zoom_in'),
    icon: ZoomInIcon,
    command: () => {
      zoomIn();
    },
  },
]);

watch(searchQuery, () => {
  debouncedApplySearch();
});

onBeforeMount(() => {
  logsSocket.connect();
  logsSocket.switchSource({ kind: 'all' });
});

onUnmounted(() => {
  logsSocket.disconnect();
});
</script>
