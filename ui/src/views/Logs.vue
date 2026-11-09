<template>
  <div class="h-full w-full dark-mode relative">
    <CuiTopbarSlot position="left">
      <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="goBack('/menu')">
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
        <IconField class="w-full sm:hidden">
          <InputIcon>
            <i-carbon:search class="text-sm" />
          </InputIcon>
          <InputText ref="mobileSearchInput" v-model="searchQuery" :placeholder="t('components.form.placeholder.search')" class="text-xs h-8 w-full" />
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

        <IconField class="hidden sm:flex">
          <InputIcon>
            <i-carbon:search class="text-sm" />
          </InputIcon>
          <InputText v-model="searchQuery" :placeholder="t('components.form.placeholder.search')" class="text-xs h-8 w-40" />
        </IconField>
      </template>
    </CuiTopNavbar>

    <div
      class="w-full h-full flex relative"
      :style="{
        paddingTop: `${TOPNAVBAR_HEIGHT}px`,
      }"
    >
      <CuiLogConsole ref="consoleRef" :options :search="searchQuery" @resize="reportSize" />
    </div>

    <CuiSpeedDial :model="items" :loading="isLoading" subtle class="absolute right-3 bottom-3 z-11" />

    <Button
      class="dark-mode opacity-40 transition absolute bottom-3 right-14 z-11 text-white"
      :class="{
        '!opacity-20': consoleRef?.atBottom,
        'hover:opacity-100 active:opacity-100 focus:opacity-100': !consoleRef?.atBottom,
      }"
      rounded
      :loading="isLoading"
      :disabled="consoleRef?.atBottom"
      @click="consoleRef?.jumpToEnd()"
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
import CopyIcon from '~icons/mdi/content-copy';
import DownloadIcon from '~icons/heroicons-solid/download';
import TrashIcon from '~icons/lucide/trash-2';
import ZoomInIcon from '~icons/tabler/zoom-in';
import ZoomOutIcon from '~icons/tabler/zoom-out';

import { CamerasQuery, clearLogFn as clearCameraLogFn, downloadLogFn as downloadCameraLogFn } from '@/api/routes/cameras.js';
import { clearLogFn as clearPluginLogFn, downloadLogFn as downloadPluginLogFn, PluginsQuery } from '@/api/routes/plugins.js';
import { clearLogFn as clearServerLogFn, downloadLogFn as downloadServerLogFn } from '@/api/routes/server.js';
import { TOPNAVBAR_HEIGHT } from '@/components/CuiTopNavbar/types.js';

import type CuiLogConsole from '@/components/CuiLogConsole/CuiLogConsole.vue';
import type CuiMenu from '@/components/CuiMenu/CuiMenu.vue';
import type { MenuItem } from '@/components/CuiMenu/types.js';
import type { ITerminalOptions } from '@xterm/xterm';
import type { CuiSpeedDialItem } from '@/components/CuiSpeedDial/types.js';

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

const { goBack } = useBackNavigation();
const { t } = useI18n();
const dialog = useCuiDialog();
const toast = useCuiToast();
const route = useRoute();
const router = useRouter();
const logsSocket = useSocket('/logs');

const uiStore = useUiStore();
const { uiSettings } = storeToRefs(uiStore);

const { data: cameras } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });
const { data: plugins } = pluginsQuery.getPluginsQuery({ page: 1, pageSize: -1 });

const SYSTEM_SOURCES: { id: string; label: string }[] = [
  { id: 'server', label: 'Server' },
  { id: 'go2rtc', label: 'go2rtc' },
  { id: 'nats', label: 'nats' },
  { id: 'tunnel', label: 'tunnel' },
];

const SCROLLBACK_ROWS = 12_000;

const { navbarWidth, navbarLeft } = toRefs(props);
const consoleRef = useTemplateRef<InstanceType<typeof CuiLogConsole>>('consoleRef');
const menuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('menuRef');
const mobileSearchInput = useTemplateRef<{ $el: HTMLElement }>('mobileSearchInput');
const activeSource = ref('all');
const searchQuery = ref('');
const mobileSearchActive = ref(false);
const isLoading = ref(false);

let consoleCols = 0;

const navbarOffset = computed(() => navbarWidth.value + navbarLeft.value);

const sourceList = computed(() => {
  const list: { id: string; label: string; group?: string }[] = [{ id: 'all', label: 'All' }];

  for (const system of SYSTEM_SOURCES) {
    list.push({ id: `system:${system.id}`, label: system.label, group: t('views.logs.groups.system') });
  }
  for (const plugin of plugins.value?.result ?? []) {
    list.push({ id: `plugin:${plugin.id}`, label: plugin.pluginName, group: t('views.logs.groups.plugins') });
  }
  for (const camera of cameras.value?.result ?? []) {
    list.push({ id: `camera:${camera._id}`, label: camera.name, group: t('views.logs.groups.cameras') });
  }

  return list;
});

const currentSourceLabel = computed(() => sourceList.value.find((source) => source.id === activeSource.value)?.label ?? activeSource.value);

const sourceItems = computed<MenuItem[]>(() =>
  sourceList.value.map((source) => ({
    key: source.id,
    label: source.label,
    group: source.group,
    active: source.id === activeSource.value,
    onClick: () => switchTo(source.id),
  })),
);

const options = computed<Partial<ITerminalOptions>>(() => {
  return {
    fontSize: uiSettings.value.console.zoom,
    scrollback: SCROLLBACK_ROWS,
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

function switchTo(sourceId: string, at?: number): void {
  activeSource.value = sourceId;
  consoleRef.value?.show(sourceId, at);
  reportSize(consoleCols);
}

function reportSize(cols: number): void {
  consoleCols = cols;
  // update and install output wraps to the width of the view showing it
  const { kind, id } = sourceParts();
  const target = kind === 'system' ? id : kind === 'plugin' ? pluginName(id) : undefined;
  if (target && cols > 0) logsSocket.emit('term-size', { target, cols });
}

function openFromQuery(): void {
  const { source, at } = route.query;
  if (typeof source !== 'string') return;

  const time = Number(at);
  switchTo(source, Number.isFinite(time) && time > 0 ? time : undefined);
  router.replace({ query: {} });
}

function sourceParts(): { kind: string; id: string } {
  const [kind, ...rest] = activeSource.value.split(':');
  return { kind, id: rest.join(':') };
}

function pluginName(pluginId: string): string | undefined {
  return plugins.value?.result.find((plugin) => plugin.id === pluginId)?.pluginName;
}

async function clearLog(): Promise<void> {
  isLoading.value = true;
  try {
    const { kind, id } = sourceParts();
    const plugin = kind === 'plugin' ? pluginName(id) : undefined;
    if (kind === 'camera') {
      await clearCameraLogFn({ cameraname: id });
    } else if (plugin) {
      await clearPluginLogFn({ pluginName: plugin });
    } else {
      await clearServerLogFn(kind === 'system' ? id : undefined);
    }
    toast.add({ severity: 'success', detail: t('components.toast.log_cleared'), life: 3000 });
  } finally {
    isLoading.value = false;
  }
}

async function downloadLog(): Promise<void> {
  isLoading.value = true;
  try {
    const { kind, id } = sourceParts();
    const controller = new AbortController();
    const plugin = kind === 'plugin' ? pluginName(id) : undefined;

    let part: BlobPart;
    let filename: string;

    if (kind === 'camera') {
      part = await downloadCameraLogFn({ cameraname: id, signal: controller.signal });
      filename = `camera.ui.${currentSourceLabel.value.replace(/ /g, '_')}.log.txt`;
    } else if (plugin) {
      part = await downloadPluginLogFn({ pluginName: plugin, signal: controller.signal });
      filename = `camera.ui.${plugin}.log.txt`;
    } else {
      const src = kind === 'system' ? id : 'all';
      part = await downloadServerLogFn({ signal: controller.signal, source: src });
      filename = src !== 'all' ? `${src}.log.txt` : 'camera.ui.log.txt';
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

const items = ref<CuiSpeedDialItem[]>([
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
    label: t('components.form.tooltip.copy_all'),
    icon: CopyIcon,
    command: () => {
      consoleRef.value?.copyAll();
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

watch(() => route.query.source, openFromQuery);

onMounted(() => {
  if (typeof route.query.source === 'string') {
    openFromQuery();
  } else {
    switchTo('all');
  }
});
</script>
