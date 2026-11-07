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
        <DndProvider :backend="isTouch ? TouchBackend : HTML5Backend" :options="isTouch ? TOUCH_DND_OPTIONS : undefined">
          <CuiTerminalTab
            v-for="tab in tabs"
            :id="tab.id"
            :key="tab.id"
            :name="tab.name"
            :active="activeTabId === tab.id"
            :status="tab.isConnected ? 'connected' : tab.isConnecting ? 'connecting' : 'disconnected'"
            :closeable="tabs.length > 1"
            @select="switchTab(tab.id)"
            @close="closeTab(tab.id)"
            @rename="(name) => renameTab(tab.id, name)"
            @move="(draggedId, after) => moveTab(draggedId, tab.id, after)"
          />
        </DndProvider>

        <CuiTopNavbarItem v-tooltip="t('views.terminal.new_tab')" type="button" @click="addTab">
          <template #icon>
            <i-carbon:add class="w-4 h-4" />
          </template>
        </CuiTopNavbarItem>
      </template>
    </CuiTopNavbar>

    <div
      class="w-full h-full flex flex-col relative"
      :style="{
        paddingTop: `${TOPNAVBAR_HEIGHT}px`,
      }"
    >
      <div
        class="flex-1 relative min-h-0 overflow-hidden"
        :class="{
          'pb-1': keyboardInset > 0,
        }"
      >
        <CuiTerminal
          v-for="tab in terminalTabs"
          v-show="activeTabId === tab.id"
          :key="tab.id"
          :ref="(el) => setTerminalRef(tab.id, el)"
          :session-id="tab.sessionId"
          :name="tab.name"
          :persistent="tab.persistent"
          :options
          :input-transform="inputTransform"
          auto-connect
          @session="(session) => onSession(tab.id, session)"
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
      data-keep-keyboard
      @mousedown.prevent
      :style="{
        bottom: `calc(0.75rem + ${toolbarSize.height.value}px)`,
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
  </div>
</template>

<script setup lang="ts">
import ReconnectIcon from '~icons/carbon/reset';
import PinIcon from '~icons/lucide/pin';
import PinOffIcon from '~icons/lucide/pin-off';
import TrashIcon from '~icons/lucide/trash-2';
import ZoomInIcon from '~icons/tabler/zoom-in';
import ZoomOutIcon from '~icons/tabler/zoom-out';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { TouchBackend } from 'react-dnd-touch-backend';
import { DndProvider } from 'vue3-dnd';

import { randomLetter } from '@/common/utils.js';
import CuiTerminal from '@/components/CuiTerminal/CuiTerminal.vue';
import CuiTerminalToolbar from '@/components/CuiTerminalToolbar/CuiTerminalToolbar.vue';
import { TOPNAVBAR_HEIGHT } from '@/components/CuiTopNavbar/types.js';

import type { TerminalSessionInfo } from '@camera.ui/browser';
import type { ITerminalInitOnlyOptions, ITerminalOptions } from '@xterm/xterm';
import type { CuiButtonAttrs } from '@/components/CuiButton/types.js';

interface SavedTab {
  id: string;
  name: string;
  sessionId?: string;
}

interface TerminalTab extends SavedTab {
  persistent: boolean;
  isConnected: boolean;
  isConnecting: boolean;
}

interface SavedLayout {
  tabs: SavedTab[];
  activeTabId: string;
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

const { isTouch } = useSharedCuiUserAgent();
const { list: listKeptSessions } = useTerminalSessions();
const coarsePointer = useMediaQuery('(pointer: coarse)');
const savedLayout = useLocalStorage<SavedLayout>('cui-terminal-pinned-tabs', { tabs: [], activeTabId: '' });

const uiStore = useUiStore();
const { uiSettings } = storeToRefs(uiStore);

const { navbarWidth, navbarLeft } = toRefs(props);
const { keyboardInset } = useKeyboardInset();

const TOUCH_DND_OPTIONS = { enableMouseEvents: true, delayTouchStart: 200 };

const toolbar = useTemplateRef<InstanceType<typeof CuiTerminalToolbar>>('toolbar');
const tabs = ref<TerminalTab[]>([]);
const activeTabId = ref('');
const terminalRefs = new Map<string, InstanceType<typeof CuiTerminal>>();

let tabCounter = 0;

const toolbarSize = useElementSize(toolbar as any);

const navbarOffset = computed(() => navbarWidth.value + navbarLeft.value);

const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeTabId.value));

const terminalTabs = computed(() => [...tabs.value].sort((a, b) => a.id.localeCompare(b.id)));

const layout = computed<SavedLayout>(() => ({
  tabs: tabs.value.filter((tab) => tab.persistent).map(({ id, name, sessionId }) => ({ id, name, sessionId })),
  activeTabId: activeTabId.value,
}));

const options = computed<ITerminalOptions & ITerminalInitOnlyOptions>(() => {
  return {
    fontSize: uiSettings.value.console.zoom,
  };
});

const items = computed<{ label: string; icon: any; buttonProps?: CuiButtonAttrs; command: () => void }[]>(() => [
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
    label: t('views.terminal.reconnect'),
    icon: ReconnectIcon,
    buttonProps: {
      disabled: activeTab.value?.isConnected || activeTab.value?.isConnecting,
    },
    command: () => {
      reconnectActiveTab();
    },
  },
  {
    label: activeTab.value?.persistent ? t('views.terminal.session_kept') : t('views.terminal.session_not_kept'),
    icon: activeTab.value?.persistent ? PinIcon : PinOffIcon,
    buttonProps: {
      severity: activeTab.value?.persistent ? 'primary' : 'secondary',
    },
    command: () => {
      togglePersistent();
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

function showActiveTerminal() {
  nextTick(() => {
    const terminalRef = getActiveTerminalRef();
    terminalRef?.refresh();
    // on phones focus opens the keyboard, so it only moves along when the keyboard is already open
    if (!coarsePointer.value || keyboardInset.value > 0) terminalRef?.focus();
  });
}

function createTab(tab: Partial<SavedTab> & { persistent?: boolean } = {}): TerminalTab {
  return {
    id: tab.id ?? randomLetter(12),
    name: tab.name ?? `Terminal ${++tabCounter}`,
    persistent: tab.persistent ?? false,
    sessionId: tab.sessionId,
    isConnected: false,
    isConnecting: true,
  };
}

function restoreTabs(kept: TerminalSessionInfo[]) {
  const saved = savedLayout.value;
  tabCounter = Math.max(0, ...[...saved.tabs, ...kept].map((tab) => Number(/^Terminal (\d+)$/.exec(tab.name ?? '')?.[1] ?? 0)));

  // a session kept on another device shows up as a tab of its own
  const known = new Set(saved.tabs.map((tab) => tab.sessionId));
  const others = kept.filter((session) => !known.has(session.sessionId));

  tabs.value = [
    ...saved.tabs.map((tab) => createTab({ ...tab, persistent: true, name: kept.find((session) => session.sessionId === tab.sessionId)?.name ?? tab.name })),
    ...others.map((session) => createTab({ name: session.name, persistent: true, sessionId: session.sessionId })),
  ];
  activeTabId.value = tabs.value.some((tab) => tab.id === saved.activeTabId) ? saved.activeTabId : (tabs.value[0]?.id ?? '');
}

function addTab() {
  const newTab = createTab();
  tabs.value.push(newTab);
  activeTabId.value = newTab.id;
}

async function closeTab(tabId: string) {
  const tabIndex = tabs.value.findIndex((tab) => tab.id === tabId);
  if (tabIndex === -1) return;

  await terminalRefs.get(tabId)?.terminate();

  tabs.value.splice(tabIndex, 1);
  terminalRefs.delete(tabId);

  if (activeTabId.value === tabId && tabs.value.length > 0) {
    const newIndex = Math.min(tabIndex, tabs.value.length - 1);
    activeTabId.value = tabs.value[newIndex].id;
    showActiveTerminal();
  }
}

function switchTab(tabId: string) {
  activeTabId.value = tabId;
  showActiveTerminal();
}

function renameTab(tabId: string, name: string) {
  const tab = tabs.value.find((t) => t.id === tabId);
  if (!tab) return;
  tab.name = name;
  terminalRefs.get(tabId)?.rename(name);
}

function togglePersistent() {
  const tab = activeTab.value;
  if (!tab) return;
  tab.persistent = !tab.persistent;
  getActiveTerminalRef()?.setPersistent(tab.persistent);
}

function onSession(tabId: string, session: TerminalSessionInfo) {
  const tab = tabs.value.find((t) => t.id === tabId);
  if (!tab) return;
  tab.sessionId = session.sessionId;
  tab.persistent = session.persistent;
  tab.name = session.name ?? tab.name;
}

function moveTab(draggedId: string, targetId: string, after: boolean) {
  const from = tabs.value.findIndex((tab) => tab.id === draggedId);
  const to = tabs.value.findIndex((tab) => tab.id === targetId);
  if (from === -1 || to === -1) return;
  if ((from < to && !after) || (from > to && after)) return;
  const [tab] = tabs.value.splice(from, 1);
  tabs.value.splice(to, 0, tab);
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
    showActiveTerminal();
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

watch(keyboardInset, (kb) => lockScroll(kb > 0));

watch(layout, (value) => {
  savedLayout.value = value;
});

onMounted(async () => {
  restoreTabs(await listKeptSessions().catch(() => []));
  if (!tabs.value.length) addTab();
});

onUnmounted(() => {
  lockScroll(false);
});
</script>
