<template>
  <div class="h-full w-full dark-mode relative overflow-hidden">
    <CuiTopbarSlot position="left">
      <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="$router.push('/menu')">
        <template #icon>
          <i-weui:back-filled class="w-6 h-6" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <CuiTopNavbar scrollable :left-offset="navbarOffset" animate>
      <template #left>
        <CuiTopNavbarItem
          v-for="tab in tabs"
          :key="tab.id"
          type="tab"
          :label="tab.name"
          :active="activeTabId === tab.id"
          :status="tab.isConnected ? 'connected' : tab.isConnecting ? 'connecting' : 'disconnected'"
          :closeable="tabs.length > 1"
          @click="switchTab(tab.id)"
          @close="closeTab(tab.id)"
        />

        <CuiTopNavbarItem v-tooltip="t('views.terminal.new_tab')" type="button" @click="addTab">
          <template #icon>
            <i-carbon:add class="w-4 h-4" />
          </template>
        </CuiTopNavbarItem>
      </template>
    </CuiTopNavbar>

    <div
      class="w-full flex flex-col relative"
      :style="{
        paddingTop: `${TOPNAVBAR_HEIGHT}px`,
        height: `calc(100% - ${effectiveKeyboardHeight}px)`,
        transition: 'height 150ms ease-out',
      }"
    >
      <div
        class="flex-1 relative min-h-0 overflow-hidden"
        :class="{
          'pb-1': keyboardHeight > 0,
        }"
      >
        <CuiTerminal
          v-for="tab in tabs"
          v-show="activeTabId === tab.id"
          :key="tab.id"
          :ref="(el) => setTerminalRef(tab.id, el)"
          :options
          :input-transform="inputTransform"
          auto-connect
          @connected="() => onConnected(tab.id)"
          @disconnected="() => onDisconnected(tab.id)"
          @error="(err) => onError(tab.id, err)"
        />
      </div>

      <CuiTerminalToolbar ref="toolbar" @send="onToolbarSend" />
    </div>

    <SpeedDial
      :model="items"
      direction="up"
      :transition-delay="80"
      :tooltip-options="{ position: 'left', event: undefined }"
      class="absolute right-3 z-11"
      :pt="{ root: { style: 'pointer-events: none' } }"
      :style="{
        bottom: `calc(0.75rem + ${toolbarSize.height.value}px + ${effectiveKeyboardHeight}px)`,
        transition: 'bottom 150ms ease-out',
      }"
    >
      <template #button="{ visible, toggleCallback }">
        <Button
          severity="secondary"
          class="dark-mode opacity-40 hover:opacity-100 active:opacity-100 focus:opacity-100 transition pointer-events-auto"
          :class="{
            'opacity-100': visible,
          }"
          rounded
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
        <Button v-tooltip="{ value: item.label }" severity="secondary" v-bind="item.buttonProps" rounded @click="toggleCallback">
          <template #icon>
            <component :is="item.icon" />
          </template>
        </Button>
      </template>
    </SpeedDial>

    <Button
      v-tooltip="t('views.terminal.reconnect')"
      class="opacity-40 hover:opacity-100 active:opacity-100 focus:opacity-100 transition absolute right-14 z-11"
      :class="{
        '!opacity-20 pointer-events-none': activeTab?.isConnected || activeTab?.isConnecting,
      }"
      :style="{
        bottom: `calc(0.75rem + ${toolbarSize.height.value}px + ${effectiveKeyboardHeight}px)`,
        transition: 'bottom 150ms ease-out',
      }"
      rounded
      :disabled="activeTab?.isConnected || activeTab?.isConnecting"
      @click="reconnectActiveTab"
    >
      <template #icon>
        <i-carbon:reset class="text-white" />
      </template>
    </Button>
  </div>
</template>

<script setup lang="ts">
import TrashIcon from '~icons/lucide/trash-2';
import ZoomInIcon from '~icons/tabler/zoom-in';
import ZoomOutIcon from '~icons/tabler/zoom-out';

import { randomLetter } from '@/common/utils.js';
import CuiTerminal from '@/components/CuiTerminal/CuiTerminal.vue';
import CuiTerminalToolbar from '@/components/CuiTerminalToolbar/CuiTerminalToolbar.vue';
import { TOPNAVBAR_HEIGHT } from '@/components/CuiTopNavbar/types.js';

import type { ITerminalInitOnlyOptions, ITerminalOptions } from '@xterm/xterm';
import type { ButtonProps } from 'primevue';

interface TerminalTab {
  id: string;
  name: string;
  isConnected: boolean;
  isConnecting: boolean;
}

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

const log = useLogger();
const { t } = useI18n();

const uiStore = useUiStore();
const { uiSettings } = storeToRefs(uiStore);

const { navbarWidth, navbarLeft } = toRefs(props);
const toolbar = useTemplateRef<InstanceType<typeof CuiTerminalToolbar>>('toolbar');
const tabs = ref<TerminalTab[]>([]);
const activeTabId = ref('');
const keyboardHeight = ref(0);
const terminalRefs = new Map<string, InstanceType<typeof CuiTerminal>>();
let fullHeight = window.innerHeight;
let tabCounter = 0;

const toolbarSize = useElementSize(toolbar as any);

const navbarOffset = computed(() => navbarWidth.value + navbarLeft.value);

const mainPaddingBottom = computed(() => {
  const container = document.getElementById('container');
  if (!container) return 0;
  return parseFloat(getComputedStyle(container).paddingBottom) || 0;
});

const effectiveKeyboardHeight = computed(() => {
  if (keyboardHeight.value <= 0) return 0;
  return Math.max(0, keyboardHeight.value - mainPaddingBottom.value);
});

const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeTabId.value));

const options = computed<ITerminalOptions & ITerminalInitOnlyOptions>(() => {
  return {
    fontSize: uiSettings.value.console.zoom,
  };
});

const items = ref<{ label: string; icon: any; buttonProps?: ButtonProps; command: () => void }[]>([
  {
    label: t('components.form.tooltip.clear'),
    icon: TrashIcon,
    buttonProps: {
      severity: 'danger',
    },
    command: () => {
      getActiveTerminalRef()?.clear();
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

function onWindowResize() {
  fullHeight = window.innerHeight;
  updateKeyboardHeight();
}

function updateKeyboardHeight() {
  const vv = window.visualViewport;
  if (!vv) return;

  const kb = Math.max(0, fullHeight - vv.height - vv.offsetTop);
  if (kb !== keyboardHeight.value) {
    keyboardHeight.value = kb;
    lockScroll(kb > 0);
  }
}

function preventScroll(e: TouchEvent) {
  if ((e.target as HTMLElement)?.closest?.('.cui-terminal-toolbar')) return;
  e.preventDefault();
}

function lockScroll(lock: boolean) {
  if (lock) {
    document.addEventListener('touchmove', preventScroll, { passive: false });
    document.documentElement.style.overscrollBehavior = 'none';
  } else {
    document.removeEventListener('touchmove', preventScroll);
    document.documentElement.style.overscrollBehavior = '';
  }
}

function setTerminalRef(tabId: string, el: any) {
  if (el) {
    terminalRefs.set(tabId, el);
  } else {
    terminalRefs.delete(tabId);
  }
}

function getActiveTerminalRef() {
  return terminalRefs.get(activeTabId.value);
}

function createTab(): TerminalTab {
  tabCounter++;
  return {
    id: randomLetter(12),
    name: `Terminal ${tabCounter}`,
    isConnected: false,
    isConnecting: true,
  };
}

function addTab() {
  const newTab = createTab();
  tabs.value.push(newTab);
  activeTabId.value = newTab.id;
}

async function closeTab(tabId: string) {
  const tabIndex = tabs.value.findIndex((tab) => tab.id === tabId);
  if (tabIndex === -1) return;

  const terminalRef = terminalRefs.get(tabId);
  if (terminalRef) {
    await terminalRef.disconnect();
  }

  tabs.value.splice(tabIndex, 1);
  terminalRefs.delete(tabId);

  if (activeTabId.value === tabId && tabs.value.length > 0) {
    const newIndex = Math.min(tabIndex, tabs.value.length - 1);
    activeTabId.value = tabs.value[newIndex].id;
    nextTick(() => {
      getActiveTerminalRef()?.refresh();
    });
  }
}

function switchTab(tabId: string) {
  activeTabId.value = tabId;
  nextTick(() => {
    const terminalRef = terminalRefs.get(tabId);
    terminalRef?.refresh();
  });
}

function inputTransform(data: string): string {
  if (!toolbar.value?.activeModifiers?.size) return data;
  const transformed = toolbar.value.applyModifiers(data);
  toolbar.value.activeModifiers.clear();
  return transformed;
}

function onToolbarSend(data: string): void {
  getActiveTerminalRef()?.sendInput(data);
}

async function reconnectActiveTab() {
  const terminalRef = getActiveTerminalRef();
  if (terminalRef) {
    await terminalRef.disconnect();
    await terminalRef.connect();
  }
}

function onConnected(tabId: string) {
  const tab = tabs.value.find((t) => t.id === tabId);
  if (tab) {
    tab.isConnected = true;
    tab.isConnecting = false;
  }
  if (tabId === activeTabId.value) {
    nextTick(() => {
      getActiveTerminalRef()?.refresh();
    });
  }
}

function onDisconnected(tabId: string) {
  const tab = tabs.value.find((t) => t.id === tabId);
  if (tab) {
    tab.isConnected = false;
    tab.isConnecting = false;
  }
}

function onError(tabId: string, error: Error) {
  log.error(`Terminal ${tabId} error:`, error);
  const tab = tabs.value.find((t) => t.id === tabId);
  if (tab) {
    tab.isConnected = false;
    tab.isConnecting = false;
  }
}

function zoomIn(): void {
  if (uiSettings.value.console.zoom === 20) {
    return;
  }

  uiSettings.value.console.zoom++;
  nextTick(() => {
    getActiveTerminalRef()?.resize();
  });
}

function zoomOut(): void {
  if (uiSettings.value.console.zoom === 8) {
    return;
  }

  uiSettings.value.console.zoom--;
  nextTick(() => {
    getActiveTerminalRef()?.resize();
  });
}

onMounted(() => {
  window.addEventListener('resize', onWindowResize);
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', updateKeyboardHeight);
    vv.addEventListener('scroll', updateKeyboardHeight);
  }
  addTab();
});

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize);
  const vv = window.visualViewport;
  if (vv) {
    vv.removeEventListener('resize', updateKeyboardHeight);
    vv.removeEventListener('scroll', updateKeyboardHeight);
  }
  lockScroll(false);
});
</script>
