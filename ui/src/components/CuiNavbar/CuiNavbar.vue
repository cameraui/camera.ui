<template>
  <nav
    ref="navbarRef"
    class="navbar-background fixed transition-[width,left] duration-200 shadow shadow-black/20 overflow-hidden border-[1px] border-base-color rounded-2xl [clip-path:inset(0_round_16px)] before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[20px] before:blur-2xl before:opacity-70 before:bg-primary-500 before:-z-1 non-draggable-region"
    :class="{
      'shadow-xl': mdBreakpoint && navbarWidth === NAVBAR_SIZE.EXPANDED,
    }"
    :style="{
      top: `calc(max(8px, var(--safe-area-inset-top)) + ${WINDOW_CONTROL_HEIGHT}px)`,
      left: navbarWidth === NAVBAR_SIZE.CLOSED ? '-2px' : 'max(8px, var(--safe-area-inset-left))',
      width: `${navbarWidth}px`,
      height: `calc(100dvh - max(8px, var(--safe-area-inset-top)) - max(8px, var(--safe-area-inset-bottom)) - ${WINDOW_CONTROL_HEIGHT}px)`,
      viewTransitionName: 'cui-navbar',
    }"
  >
    <div class="h-full flex flex-col overflow-hidden">
      <div class="w-full flex items-center shrink-0 h-[60px]">
        <RouterLink to="/" class="pl-[13px]">
          <InlineSvg
            :src="getImageUrl('logo_animated.svg')"
            width="32px"
            height="32px"
            title="camera.ui"
            aria-label="camera.ui"
            class="hover:scale-105 active:scale-105 focus:scale-105 transition-all"
          />
        </RouterLink>

        <div class="overflow-hidden w-full pr-4">
          <Transition name="fade">
            <div v-if="navbarWidth === NAVBAR_SIZE.EXPANDED" class="ml-2 w-full flex flex-row items-center">
              <RouterLink to="/" class="text-white font-bold text-lg text-shadow">camera.ui</RouterLink>
              <Button
                v-if="!navEditMode"
                v-tooltip.bottom="$t('navigation.edit_nav')"
                text
                rounded
                severity="secondary"
                class="dark-mode cui-icon-md ml-auto !text-[#a4a4a4] hover:!text-white"
                @click="enterNavEdit"
              >
                <template #icon>
                  <i-lucide:pencil class="!w-[16px] !h-[16px]" />
                </template>
              </Button>
            </div>
          </Transition>
        </div>
      </div>

      <div ref="scrollRef" class="flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden mt-4 px-1 pb-2">
        <template v-if="!navEditMode">
          <div class="flex flex-col space-y-1">
            <CuiNavbarGroup
              v-for="group in topGroups"
              :key="group.key"
              :group
              :open="groupExpanded[group.key]"
              :active="isGroupRouteActive(group.key)"
              :expanded="navbarWidth === NAVBAR_SIZE.EXPANDED"
              @toggle="toggleGroup(group.key)"
              @entered="onGroupEntered(group.key)"
              @left="revealActiveItem"
            />
          </div>

          <div class="flex-1 mt-10"></div>

          <div class="flex flex-col space-y-1">
            <CuiNavbarGroup
              v-for="group in bottomGroups"
              :key="group.key"
              :group
              :open="groupExpanded[group.key]"
              :active="isGroupRouteActive(group.key)"
              :expanded="navbarWidth === NAVBAR_SIZE.EXPANDED"
              @toggle="toggleGroup(group.key)"
              @entered="onGroupEntered(group.key)"
              @left="revealActiveItem"
            />

            <div v-for="route in bottomPrimaryRoutes" v-show="!(settingsInNav && route.path === '/settings')" :key="route.name" class="w-full h-[50px] relative">
              <Badge v-if="anyUpdateAvailable && route.name === 'Updates'" class="absolute min-w-[8px] w-[8px] h-[8px] left-[31px] top-[10px] z-1"></Badge>
              <CuiNavItem
                :icon="route.meta!.navbar!.icon.default"
                :active-icon="route.meta!.navbar!.icon.active"
                :to="route.path === '/settings' ? `/settings/${defaultSettingsPage}` : route.path"
                :fallback-active-path="route.path"
                :label="$t(`navigation.${(route.name as string).toLowerCase()}`)"
                :expanded="navbarWidth === NAVBAR_SIZE.EXPANDED"
                dark-mode
                show-tooltip
                :icon-size="22"
                :button-props="{
                  style: {
                    color: '#a4a4a4',
                  },
                }"
                class="w-[50px] h-[50px]"
                :class="{
                  'w-full': navbarWidth === NAVBAR_SIZE.EXPANDED,
                }"
              />
            </div>
          </div>
        </template>

        <DndProvider v-else :backend="dndBackend" :options="dndOptions">
          <div class="flex flex-col flex-1">
            <div class="flex flex-col space-y-1">
              <template v-for="groupKey in editGroupKeys" :key="`edit-${groupKey}`">
                <CuiNavbarEditGroupLabel :group="groupKey" :label="$t(`navigation.group_${groupKey}`)" :first="groupKey === 'main'" :move-to-end="moveEditToEnd" />
                <TransitionGroup name="nav-edit" tag="div" class="relative flex flex-col space-y-1">
                  <CuiNavbarEditItem
                    v-for="name in editLists[groupKey]"
                    :key="name"
                    :name="name"
                    :icon="editEntry(name)?.icon"
                    :label="$t(`navigation.${editEntry(name)?.labelKey ?? name.toLowerCase()}`)"
                    :expanded="navbarWidth === NAVBAR_SIZE.EXPANDED"
                    :hideable="editEntry(name)?.kind === 'settings'"
                    :hidden="isHidden(name)"
                    :find-item="findEditItem"
                    :move-item="moveEditItem"
                    @toggle-hidden="toggleHidden(name)"
                  />
                </TransitionGroup>
              </template>
            </div>
          </div>
        </DndProvider>
      </div>

      <div v-if="!navEditMode" class="shrink-0 px-1 pb-4">
        <div class="mb-4 mt-2" :class="navbarWidth === NAVBAR_SIZE.EXPANDED ? 'border-t border-[#313131]' : 'w-[22px] mx-auto border-t border-[#313131]'"></div>
        <div v-if="canToggleHostMenu" class="w-full h-[50px] relative">
          <Badge v-if="hostMenuBadge" class="absolute min-w-[8px] w-[8px] h-[8px] left-[31px] top-[10px] z-1"></Badge>
          <Button
            v-tooltip.right="{ value: navbarWidth === NAVBAR_SIZE.MINIFIED ? $t('views.menu.home_assistant') : '', pt: { root: { class: 'dark-mode' } } }"
            text
            severity="secondary"
            class="cui-button navitem-button navitem-inactive w-full h-full flex items-center relative dark-mode hover:!text-color active:!text-color focus:!text-color"
            :style="{
              color: '#a4a4a4',
            }"
            fluid
            @click="toggleHostMenu()"
          >
            <template #default>
              <div class="flex items-center justify-center h-full absolute left-[14px]">
                <i-mdi:home-assistant class="w-[24px] h-[24px]" />
              </div>
              <Transition name="fade">
                <div v-if="navbarWidth === NAVBAR_SIZE.EXPANDED" class="overflow-hidden flex-1 ml-10 text-start text-sm font-semibold truncate">
                  {{ $t('views.menu.home_assistant') }}
                </div>
              </Transition>
            </template>
          </Button>
        </div>

        <div v-if="navbarWidth === NAVBAR_SIZE.MINIFIED && signOut" class="w-full h-[50px]">
          <Button
            v-tooltip.right="$t('views.menu.logout')"
            text
            severity="secondary"
            class="cui-button navitem-button navitem-inactive w-[50px] h-[50px] flex items-center justify-center dark-mode hover:!text-color active:!text-color focus:!text-color"
            :style="{
              color: '#a4a4a4',
            }"
            @click="authStore.logout()"
          >
            <template #icon>
              <i-tabler:power class="w-[22px] h-[22px]" />
            </template>
          </Button>
        </div>

        <div class="w-full h-[50px] relative">
          <CuiNavItem
            avatar="avatar"
            :label="user?.username ?? 'unknown'"
            :description="user?.role ?? 'unknown'"
            :expanded="navbarWidth === NAVBAR_SIZE.EXPANDED"
            :show-logout="signOut"
            to="/settings/account"
            dark-mode
            :avatar-size="38"
            class="w-[50px] h-[50px]"
            :class="{
              'w-full': navbarWidth === NAVBAR_SIZE.EXPANDED,
            }"
          />
        </div>
      </div>

      <div v-else class="shrink-0 flex flex-col gap-2 px-1 pt-2 pb-2">
        <Button severity="secondary" :label="$t('components.form.button.reset_defaults')" class="dark-mode w-full h-[40px] !text-sm" @click="resetNavEdit">
          <template #icon>
            <i-mdi:backup-restore class="w-[18px] h-[18px]" />
          </template>
        </Button>
        <Button severity="primary" class="w-full h-[40px]" @click="exitNavEdit">
          <template #icon>
            <i-lucide:check class="w-[20px] h-[20px]" />
          </template>
        </Button>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { HTML5Backend } from 'react-dnd-html5-backend';
import { TouchBackend } from 'react-dnd-touch-backend';
import InlineSvg from 'vue-inline-svg';
import { DndProvider } from 'vue3-dnd';

import { ApiQuery } from '@/api/routes/api.js';
import { canSignOut } from '@/common/base.js';
import { getImageUrl } from '@/common/utils.js';
import { WINDOW_CONTROL_HEIGHT } from '@/components/CuiWindowButtons/types.js';
import { routes } from '@/router/index.js';
import { NAVBAR_SIZE } from './types.js';

import type { NavLayoutEntry, NavLayoutGroup } from '@/composables/useNavLayout.js';
import type { IpcRendererEvent } from '@/types/electron';
import type { NavbarGroupVm, NavbarState } from './types.js';

const apiQuery = new ApiQuery();

const router = useRouter();
const { bus } = useCuiBus();
const { mdBreakpoint, xlBreakpoint } = useSharedCuiBreakpoint();
const { navbarState: navState } = useSharedCuiStates();
const { isElectronApp, electron } = useElectron();
const { isTouch } = useSharedCuiUserAgent();
const serverSocket = useServerSocket();
const { entries: navEntries, groups: navGroups, settingsInNav, isCollapsible, isHidden, toggleHidden, persistOrder, resetOrder } = useNavLayout();
const { canToggle: canToggleHostMenu, badge: hostMenuBadge, toggle: toggleHostMenu } = useHostMenu();

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

const uiStore = useUiStore();
const { uiSettings } = storeToRefs(uiStore);

const { data: apiInfo } = apiQuery.apiInfoQuery();

const signOut = canSignOut();
const REVEAL_MARGIN = 8;

const navbarRef = useTemplateRef('navbarRef');
const scrollRef = useTemplateRef('scrollRef');
const state = ref<NavbarState>('closed');
const serverUpdateAvailable = ref(false);
const pluginUpdateAvailable = ref(false);
const workerUpdateAvailable = ref(false);

const groupExpanded = ref<Record<NavLayoutGroup, boolean>>({ main: true, manage: true, system: false, settings: false });
const navEditMode = ref(false);
const editLists = ref<Record<NavLayoutGroup, string[]>>({ main: [], manage: [], system: [], settings: [] });
let userOpenedGroup: NavLayoutGroup | undefined;

const anyUpdateAvailable = computed(() => serverUpdateAvailable.value || pluginUpdateAvailable.value || workerUpdateAvailable.value);

const isElectronBuild = computed(() => apiInfo.value?.electron ?? false);

const serverUpdatesViaElectron = computed(() => isElectronApp && isElectronBuild.value);

const defaultSettingsPage = computed(() => {
  const view = uiSettings.value.interface.selectedSettingsView;
  return settingsViews.includes(view) ? view : 'account';
});

const bottomPrimaryRoutes = computed<RouteRecordRaw[]>(() =>
  routes.filter((route) => route.meta?.navbar?.position === 'bottom' && !route.meta?.navbar?.group && hasPermission(route) && !hiddenInElectron(route)),
);

const topGroups = computed(() => buildGroupVms(['main', 'manage']));

const bottomGroups = computed(() => buildGroupVms(['system', 'settings']));

const editGroupKeys = computed<NavLayoutGroup[]>(() => (settingsInNav.value ? ALL_NAV_GROUPS : NAV_GROUPS));

const dndBackend = computed(() => (isTouch.value ? TouchBackend : HTML5Backend));

const dndOptions = computed(() => (isTouch.value ? { enableMouseEvents: true } : undefined));

const navbarState = computed<NavbarState>(() => {
  if (uiSettings.value.interface.navbarStayCollapsed && state.value !== 'opened') {
    return 'closed';
  } else if (xlBreakpoint.value) {
    return 'opened';
  } else {
    return state.value;
  }
});

const navbarWidth = computed(() => {
  if (navbarState.value === 'closed') {
    return mdBreakpoint.value ? NAVBAR_SIZE.CLOSED : NAVBAR_SIZE.MINIFIED;
  } else {
    return NAVBAR_SIZE.EXPANDED;
  }
});

function hiddenInElectron(route: RouteRecordRaw): boolean {
  return isElectronBuild.value && !!route.meta?.disabledInElectron;
}

function buildGroupVms(keys: NavLayoutGroup[]): NavbarGroupVm[] {
  const vms: NavbarGroupVm[] = [];
  for (const key of keys) {
    if (key === 'settings' && !settingsInNav.value) continue;
    const items = navGroups.value[key].filter((entry) => !hiddenInElectron(entry.route) && !isHidden(entry.name));
    if (!items.length) continue;
    vms.push({ key, items, collapsible: isCollapsible(key), first: vms.length === 0 });
  }
  return vms;
}

function isGroupRouteActive(key: NavLayoutGroup): boolean {
  return navGroups.value[key].some((entry) => router.currentRoute.value.path === entry.to || router.currentRoute.value.path.startsWith(entry.to + '/'));
}

function toggleGroup(key: NavLayoutGroup) {
  groupExpanded.value[key] = !groupExpanded.value[key];
  userOpenedGroup = groupExpanded.value[key] ? key : undefined;
}

function onGroupEntered(key: NavLayoutGroup) {
  if (userOpenedGroup === key) {
    userOpenedGroup = undefined;
    reveal(Array.from(scrollRef.value?.querySelectorAll(`[data-nav-group="${key}"]`) ?? []));
  } else {
    revealActiveItem();
  }
}

function revealActiveItem() {
  nextTick(() => {
    // group headers are marked active too, and the settings entry hidden by v-show has no box
    const active = Array.from(scrollRef.value?.querySelectorAll('a .navitem-active') ?? []).find((el) => el.getClientRects().length > 0);
    if (active) reveal([active]);
  });
}

function reveal(elements: Element[]) {
  const container = scrollRef.value;
  if (!container || !elements.length) return;
  const view = container.getBoundingClientRect();
  const rects = elements.map((el) => el.getBoundingClientRect());
  const top = Math.min(...rects.map((rect) => rect.top)) - view.top - REVEAL_MARGIN;
  const bottom = Math.max(...rects.map((rect) => rect.bottom)) - view.top + REVEAL_MARGIN;
  const offset = top < 0 || bottom - top > container.clientHeight ? top : Math.max(0, bottom - container.clientHeight);
  if (offset !== 0) container.scrollBy({ top: offset, behavior: 'smooth' });
}

function snapshotEditLists(): void {
  editLists.value = {
    main: navGroups.value.main.map((entry) => entry.name),
    manage: navGroups.value.manage.map((entry) => entry.name),
    system: navGroups.value.system.map((entry) => entry.name),
    settings: navGroups.value.settings.map((entry) => entry.name),
  };
}

function enterNavEdit(): void {
  snapshotEditLists();
  navEditMode.value = true;
  bus.emit({ navbarState: 'opened' });
}

function exitNavEdit(): void {
  persistOrder(editLists.value);
  navEditMode.value = false;
}

function resetNavEdit(): void {
  resetOrder();
  snapshotEditLists();
}

function editEntry(name: string): NavLayoutEntry | undefined {
  return navEntries.value.find((entry) => entry.name === name);
}

function findEditItem(name: string): { group: NavLayoutGroup; index: number } | undefined {
  for (const group of ALL_NAV_GROUPS) {
    const index = editLists.value[group].indexOf(name);
    if (index >= 0) return { group, index };
  }
  return undefined;
}

function moveEditItem(name: string, group: NavLayoutGroup, index: number): void {
  const from = findEditItem(name);
  if (!from) return;
  editLists.value[from.group].splice(from.index, 1);
  editLists.value[group].splice(index, 0, name);
}

function moveEditToEnd(name: string, group: NavLayoutGroup): void {
  const from = findEditItem(name);
  if (!from) return;
  if (from.group === group && from.index === editLists.value[group].length - 1) return;
  editLists.value[from.group].splice(from.index, 1);
  editLists.value[group].push(name);
}

function closeNavbar() {
  bus.emit({ navbarState: 'closed' });
}

function onAppStatus(_event: IpcRendererEvent, data: any) {
  if (!serverUpdatesViaElectron.value) {
    return;
  }

  if (data.channel === 'update-check' && data.status === 'available') {
    serverUpdateAvailable.value = true;
  }
}

async function initElectronUpdater() {
  if (!serverUpdatesViaElectron.value) {
    return;
  }

  electron!.removeListener('app-status', onAppStatus);
  electron!.on('app-status', onAppStatus);

  electron!.send('check-for-updates');

  try {
    const response: { isUpdateAvailable: boolean; version?: string } = await electron!.invoke('get-update-available');
    serverUpdateAvailable.value = response.isUpdateAvailable;
  } catch {}
}

const debouncedRevealActiveItem = useDebounceFn(revealActiveItem, 100);

onClickOutside(navbarRef, (event) => {
  if (navbarState.value !== 'opened') return;
  const target = event.target as HTMLElement;
  const menuIcon = target.closest('#menu-icon');
  const submenuIcon = target.closest('#submenu-icon');
  const navbarIcon = target.closest('#navbar-icon');
  if (!menuIcon && !submenuIcon && !navbarIcon) {
    closeNavbar();
  }
});

useResizeObserver(navbarRef, () => {
  debouncedRevealActiveItem();
});

watch(navbarState, (value) => {
  if (navEditMode.value && value !== 'opened') exitNavEdit();
});

watch(
  () => router.currentRoute.value.path,
  () => {
    for (const key of ALL_NAV_GROUPS) {
      if (isGroupRouteActive(key)) groupExpanded.value[key] = true;
    }
    revealActiveItem();
  },
  { immediate: true },
);

watch(
  serverSocket.serverUpdateAvailable,
  (val) => {
    if (!serverUpdatesViaElectron.value) {
      serverUpdateAvailable.value = val;
    }
  },
  { immediate: true },
);

watch(
  serverUpdatesViaElectron,
  (viaElectron) => {
    if (viaElectron) {
      initElectronUpdater();
    }
  },
  { immediate: true },
);

watch(serverSocket.pluginUpdateAvailable, (val) => {
  pluginUpdateAvailable.value = val;
});

watch(serverSocket.workerUpdateAvailable, (val) => {
  workerUpdateAvailable.value = val;
});

watch(
  navState,
  (newState) => {
    if (newState && newState !== state.value) {
      state.value = newState === 'minified' || newState === 'closed' ? 'closed' : 'opened';
    }
  },
  { immediate: true },
);

watch(router.currentRoute, (newRoute, oldRoute) => {
  if (newRoute.path !== oldRoute.path) {
    closeNavbar();
  }
});

watch(
  user,
  () => {
    if (user.value?.role === 'admin' || user.value?.role === 'master') {
      serverSocket.connect();
    } else {
      serverSocket.disconnect();
    }
  },
  { deep: true, immediate: true },
);

onMounted(() => {
  revealActiveItem();
});

onUnmounted(() => {
  electron?.removeListener('app-status', onAppStatus);
});

defineExpose({
  navbarState,
});
</script>

<style scoped>
.nav-edit-move,
.nav-edit-enter-active,
.nav-edit-leave-active {
  transition:
    transform 0.25s ease,
    opacity 0.2s ease;
}

.nav-edit-enter-from,
.nav-edit-leave-to {
  opacity: 0;
}

.nav-edit-leave-active {
  position: absolute;
  width: 100%;
}
</style>
