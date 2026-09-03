<template>
  <nav
    ref="navbarRef"
    class="navbar-background fixed transition-[width,left] duration-200 shadow shadow-black/20 overflow-hidden border-[1px] border-base-color rounded-[15px] [clip-path:inset(0_round_15px)] before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[20px] before:blur-2xl before:opacity-70 before:bg-primary-500 before:-z-1 non-draggable-region"
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

      <div class="flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden mt-4 px-1 pb-2">
        <template v-if="!navEditMode">
          <div class="flex flex-col space-y-1">
            <template v-for="group in topGroups" :key="group.key">
              <div v-if="group.collapsible" class="w-full h-[50px]" :class="{ 'mt-5': !group.first }">
                <Button
                  text
                  severity="secondary"
                  class="cui-button navitem-button w-full h-full flex items-center justify-center dark-mode"
                  :class="{
                    '!text-white navitem-active': groupExpanded[group.key] || isGroupRouteActive(group.key),
                    'hover:!text-color active:!text-color focus:!text-color navitem-inactive': !groupExpanded[group.key] && !isGroupRouteActive(group.key),
                  }"
                  :style="{
                    color: '#a4a4a4',
                  }"
                  @click="toggleGroup(group.key)"
                >
                  <template #default>
                    <div class="flex items-center h-full absolute left-[14px] gap-3">
                      <i-mdi:chevron-down v-if="groupExpanded[group.key]" class="w-[22px] h-[22px]" />
                      <i-mdi:chevron-up v-else class="w-[22px] h-[22px]" />
                      <span v-if="navbarWidth === NAVBAR_SIZE.EXPANDED" class="text-[11px] font-semibold uppercase tracking-widest whitespace-nowrap">{{
                        $t(`navigation.group_${group.key}`)
                      }}</span>
                    </div>
                  </template>
                </Button>
              </div>
              <div v-else-if="group.key !== 'main'" class="w-full flex items-center h-[26px] mb-1" :class="{ 'mt-5': !group.first }">
                <span
                  v-if="navbarWidth === NAVBAR_SIZE.EXPANDED"
                  class="pl-[17px] text-[11px] font-semibold uppercase tracking-widest text-[#7a7a7a] whitespace-nowrap"
                  >{{ $t(`navigation.group_${group.key}`) }}</span
                >
                <div v-else class="w-[22px] mx-auto border-t border-[#313131]"></div>
              </div>

              <Transition name="navbar-group">
                <div v-if="!group.collapsible || groupExpanded[group.key]" class="flex flex-col space-y-1 overflow-hidden">
                  <div v-for="item in group.items" :key="item.name" class="w-full h-[50px] relative">
                    <CuiNavItem
                      :icon="item.icon"
                      :active-icon="item.activeIcon"
                      :to="item.to"
                      :label="$t(`navigation.${item.labelKey}`)"
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
              </Transition>
            </template>
          </div>

          <div class="flex-1 mt-10"></div>

          <div class="flex flex-col space-y-1">
            <template v-for="group in bottomGroups" :key="group.key">
              <div v-if="group.collapsible" class="w-full h-[50px]" :class="{ 'mt-5': !group.first }">
                <Button
                  text
                  severity="secondary"
                  class="cui-button navitem-button w-full h-full flex items-center justify-center dark-mode"
                  :class="{
                    '!text-white navitem-active': groupExpanded[group.key] || isGroupRouteActive(group.key),
                    'hover:!text-color active:!text-color focus:!text-color navitem-inactive': !groupExpanded[group.key] && !isGroupRouteActive(group.key),
                  }"
                  :style="{
                    color: '#a4a4a4',
                  }"
                  @click="toggleGroup(group.key)"
                >
                  <template #default>
                    <div class="flex items-center h-full absolute left-[14px] gap-3">
                      <i-mdi:chevron-down v-if="groupExpanded[group.key]" class="w-[22px] h-[22px]" />
                      <i-mdi:chevron-up v-else class="w-[22px] h-[22px]" />
                      <span v-if="navbarWidth === NAVBAR_SIZE.EXPANDED" class="text-[11px] font-semibold uppercase tracking-widest whitespace-nowrap">{{
                        $t(`navigation.group_${group.key}`)
                      }}</span>
                    </div>
                  </template>
                </Button>
              </div>
              <div v-else-if="group.key !== 'main'" class="w-full flex items-center h-[26px] mb-1" :class="{ 'mt-5': !group.first }">
                <span
                  v-if="navbarWidth === NAVBAR_SIZE.EXPANDED"
                  class="pl-[17px] text-[11px] font-semibold uppercase tracking-widest text-[#7a7a7a] whitespace-nowrap"
                  >{{ $t(`navigation.group_${group.key}`) }}</span
                >
                <div v-else class="w-[22px] mx-auto border-t border-[#313131]"></div>
              </div>

              <Transition name="navbar-group">
                <div v-if="!group.collapsible || groupExpanded[group.key]" class="flex flex-col space-y-1 overflow-hidden">
                  <div v-for="item in group.items" :key="item.name" class="w-full h-[50px] relative">
                    <CuiNavItem
                      :icon="item.icon"
                      :active-icon="item.activeIcon"
                      :to="item.to"
                      :label="$t(`navigation.${item.labelKey}`)"
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
              </Transition>
            </template>

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

        <div v-if="navbarWidth === NAVBAR_SIZE.MINIFIED" class="w-full h-[50px]">
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
            show-logout
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
const { canToggle: canToggleHostMenu, toggle: toggleHostMenu } = useHostMenu();

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

const uiStore = useUiStore();
const { uiSettings } = storeToRefs(uiStore);

const { data: apiInfo } = apiQuery.apiInfoQuery();

const navbarRef = useTemplateRef('navbarRef');
const state = ref<NavbarState>('closed');
const serverUpdateAvailable = ref(false);
const pluginUpdateAvailable = ref(false);
const workerUpdateAvailable = ref(false);

const groupExpanded = ref<Record<NavLayoutGroup, boolean>>({ main: true, manage: true, system: false, settings: false });
const navEditMode = ref(false);
const editLists = ref<Record<NavLayoutGroup, string[]>>({ main: [], manage: [], system: [], settings: [] });

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
  if (groupExpanded.value[key] && key === 'system') {
    setTimeout(() => {
      const el = navbarRef.value?.firstElementChild as HTMLElement | null;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, 250);
  } else if (!groupExpanded.value[key]) {
    setTimeout(() => scrollActiveItemIntoView(), 250);
  }
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
  } catch {
    //
  }
}

function scrollActiveItemIntoView() {
  nextTick(() => {
    const activeItem = navbarRef.value?.querySelector('.navitem-active');
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
}

const debouncedScrollActiveItemIntoView = useDebounceFn(scrollActiveItemIntoView, 100);

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
  debouncedScrollActiveItemIntoView();
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
  scrollActiveItemIntoView();
});

onUnmounted(() => {
  electron?.removeListener('app-status', onAppStatus);
});

defineExpose({
  navbarState,
});
</script>

<style scoped>
.navbar-group-enter-active,
.navbar-group-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.navbar-group-enter-from,
.navbar-group-leave-to {
  max-height: 0;
  opacity: 0;
}

.navbar-group-enter-to,
.navbar-group-leave-from {
  max-height: 400px;
  opacity: 1;
}

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
