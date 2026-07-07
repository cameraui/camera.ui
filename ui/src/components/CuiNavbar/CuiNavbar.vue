<template>
  <nav
    ref="navbarRef"
    class="navbar-background fixed transition-[width,left] duration-200 overflow-x-hidden overflow-y-scroll shadow shadow-black/20 overflow-hidden border-[1px] border-base-color rounded-[15px] [clip-path:inset(0_round_15px)] before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[20px] before:blur-2xl before:opacity-70 before:bg-primary-500 before:-z-1"
    :class="{
      'shadow-xl': mdBreakpoint && navbarWidth === NAVBAR_SIZE.EXPANDED,
    }"
    :style="{
      top: `calc(max(8px, env(safe-area-inset-top, 0px)) + ${WINDOW_CONTROL_HEIGHT}px)`,
      left: navbarWidth === NAVBAR_SIZE.CLOSED ? '-2px' : 'max(8px, env(safe-area-inset-left, 0px))',
      width: `${navbarWidth}px`,
      height: `calc(100dvh - max(8px, env(safe-area-inset-top, 0px)) - max(8px, env(safe-area-inset-bottom, 0px)) - ${WINDOW_CONTROL_HEIGHT}px)`,
      viewTransitionName: 'cui-navbar',
    }"
  >
    <div class="h-full flex flex-col overflow-y-scroll">
      <div class="w-full flex items-center shrink-0 h-[60px]">
        <RouterLink to="/home" class="pl-[13px]">
          <InlineSvg
            :src="getImageUrl('logo_animated.svg')"
            width="32px"
            height="32px"
            title="camera.ui"
            aria-label="camera.ui"
            class="hover:scale-105 active:scale-105 focus:scale-105 transition-all non-draggable-region"
          />
        </RouterLink>

        <div class="overflow-hidden w-full pr-4">
          <Transition name="fade">
            <div v-if="navbarWidth === NAVBAR_SIZE.EXPANDED" class="ml-2 w-full flex flex-row items-center">
              <RouterLink to="/home" class="text-white font-bold text-lg text-shadow">camera.ui</RouterLink>
            </div>
          </Transition>
        </div>
      </div>

      <div class="flex flex-col flex-1 my-4 px-1">
        <div class="flex flex-col space-y-1">
          <div v-for="route in topRoutes" :key="route.name" class="w-full h-[50px] relative">
            <Badge v-if="pluginUpdateAvailable && route.name === 'Plugins'" class="absolute min-w-[8px] w-[8px] h-[8px] left-[31px] top-[10px] z-1"></Badge>
            <CuiNavItem
              :icon="route.meta!.navbar!.icon.default"
              :active-icon="route.meta!.navbar!.icon.active"
              :to="route.path"
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

        <div class="flex-1 mt-10"></div>

        <div class="flex flex-col space-y-1">
          <template v-if="moreRoutes.length">
            <div class="w-full h-[50px]">
              <Button
                text
                severity="secondary"
                class="cui-button navitem-button w-full h-full flex items-center justify-center dark-mode"
                :class="{
                  '!text-white navitem-active': moreExpanded || isMoreRouteActive,
                  'hover:!text-color active:!text-color focus:!text-color navitem-inactive': !moreExpanded && !isMoreRouteActive,
                }"
                :style="{
                  color: '#a4a4a4',
                }"
                @click="toggleMore"
              >
                <template #default>
                  <div class="flex items-center justify-center h-full absolute left-[14px]">
                    <i-mdi:chevron-down v-if="moreExpanded" class="w-[22px] h-[22px]" />
                    <i-mdi:chevron-up v-else class="w-[22px] h-[22px]" />
                  </div>
                </template>
              </Button>
            </div>

            <Transition name="navbar-group">
              <div v-if="moreExpanded" class="flex flex-col space-y-1 overflow-hidden">
                <div v-for="route in moreRoutes" :key="route.name" class="w-full h-[50px] relative">
                  <CuiNavItem
                    :icon="route.meta!.navbar!.icon.default"
                    :active-icon="route.meta!.navbar!.icon.active"
                    :to="route.path"
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
            </Transition>
          </template>

          <div v-for="route in bottomPrimaryRoutes" :key="route.name" class="w-full h-[50px] relative">
            <Badge v-if="serverUpdateAvailable && route.name === 'Settings'" class="absolute min-w-[8px] w-[8px] h-[8px] left-[31px] top-[10px] z-1"></Badge>
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
          <div
            class="mb-4 mt-2"
            :style="{
              borderTop: '1px solid #313131',
            }"
          ></div>
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
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import InlineSvg from 'vue-inline-svg';

import { ApiQuery } from '@/api/routes/api.js';
import { getImageUrl } from '@/common/utils.js';
import { WINDOW_CONTROL_HEIGHT } from '@/components/CuiWindowButtons/types.js';
import { routes } from '@/router/index.js';
import { NAVBAR_SIZE } from './types.js';

import type { IpcRendererEvent } from '@/types/electron';
import type { NavbarState } from './types.js';

const router = useRouter();
const { bus } = useCuiBus();
const { mdBreakpoint, xlBreakpoint } = useSharedCuiBreakpoint();
const { navbarState: navState } = useSharedCuiStates();
const { isElectronApp, electron } = useElectron();

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

const uiStore = useUiStore();
const { uiSettings } = storeToRefs(uiStore);

const serverSocket = useServerSocket();
const apiQuery = new ApiQuery();

const { data: apiInfo } = apiQuery.apiInfoQuery();

const navbarRef = useTemplateRef('navbarRef');
const state = ref<NavbarState>('closed');
const serverUpdateAvailable = ref(false);
const pluginUpdateAvailable = ref(false);
const moreExpanded = ref(false);

const isElectronBuild = computed(() => apiInfo.value?.electron ?? false);

const serverUpdatesViaElectron = computed(() => isElectronApp && isElectronBuild.value);

const defaultSettingsPage = computed(() => {
  const view = uiSettings.value.interface.selectedSettingsView;
  return settingsViews.includes(view) ? view : 'account';
});

const hiddenInElectron = (route: RouteRecordRaw): boolean => isElectronBuild.value && !!route.meta?.disabledInElectron;

const topRoutes = computed<RouteRecordRaw[]>(() =>
  routes.filter((route) => route.meta?.navbar?.position === 'top' && route.meta && hasPermission(route) && !hiddenInElectron(route)),
);

const bottomRoutes = computed<RouteRecordRaw[]>(() =>
  routes.filter((route) => route.meta?.navbar?.position === 'bottom' && hasPermission(route) && !hiddenInElectron(route)),
);

const bottomPrimaryRoutes = computed(() => bottomRoutes.value.filter((r) => !r.meta?.navbar?.group));

const moreRoutes = computed(() => bottomRoutes.value.filter((r) => r.meta?.navbar?.group === 'more'));

const isMoreRouteActive = computed(() =>
  moreRoutes.value.some((r) => router.currentRoute.value.path === r.path || router.currentRoute.value.path.startsWith(r.path + '/')),
);

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

function toggleMore() {
  moreExpanded.value = !moreExpanded.value;
  if (moreExpanded.value) {
    setTimeout(() => {
      const el = navbarRef.value?.firstElementChild as HTMLElement | null;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, 250);
  } else {
    setTimeout(() => scrollActiveItemIntoView(), 250);
  }
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

watch(
  isMoreRouteActive,
  (active) => {
    if (active) moreExpanded.value = true;
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

watch(navState, (newState) => {
  if (newState && newState !== state.value) {
    state.value = newState === 'minified' || newState === 'closed' ? 'closed' : 'opened';
  }
});

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
</style>
