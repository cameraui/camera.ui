<template>
  <nav
    ref="subnavbarRef"
    class="cui-subnavbar fixed transition-all duration-200 overflow-x-hidden overflow-y-scroll md:!pl-0 pl-safe pb-safe w-full h-full flex flex-col"
    :style="{
      width: `${subnavbarWidth}px`,
      borderRightWidth: subnavbarState === 'opened' ? '1px' : '0px',
      paddingBottom: `calc(env(safe-area-inset-top, 0px) + env(safe-area-inset-bottom, 0px) + ${bottombarHeight}px + ${topbarHeight}px)`,
    }"
  >
    <CuiSubNavItem
      v-for="route in navRoutes"
      :key="route.name"
      :icon="route.meta!.settingsBar!.icon!.default"
      :active-icon="route.meta!.settingsBar!.icon!.active"
      :to="route.path"
      :label="$t(`navigation.${(route.meta?.name as string).toLowerCase()}`)"
      :description="$t(`navigation_description.${route.meta?.description!}`)"
      class="cui-list-item !m-0 !p-0 shrink-0"
      :style="{
        width: `${SUB_NAVBAR_SIZE.EXPANDED}px`,
      }"
    />
  </nav>
</template>

<script setup lang="ts">
import { routes } from '@/router/index.js';

import { SUB_NAVBAR_SIZE } from './types.js';

import type { SubNavbarState } from './types.js';

const router = useRouter();
const { bus } = useCuiBus();
const { xlBreakpoint, mdBreakpoint } = useSharedCuiBreakpoint();
const { bottombarHeight, subbarState: subState, navbarState, topbarHeight } = useSharedCuiStates();

const subnavbarRef = useTemplateRef('subnavbarRef');
const state = ref<SubNavbarState>('closed');

const subnavbarState = computed<SubNavbarState>(() => {
  if (xlBreakpoint.value) {
    return 'opened';
  } else {
    return state.value;
  }
});
const subnavbarWidth = computed(() => {
  if (subnavbarState.value === 'closed') {
    return SUB_NAVBAR_SIZE.CLOSED;
  } else {
    return SUB_NAVBAR_SIZE.EXPANDED;
  }
});
const navRoutes = computed<RouteRecordRaw[]>(() =>
  routes.find((route) => route.name === 'Settings')!.children!.filter((route) => route.meta?.settingsBar && hasPermission(route)),
);

function closeNavbar() {
  state.value = 'closed';
  bus.emit({ subbarState: 'closed' });
}

function scrollActiveItemIntoView() {
  nextTick(() => {
    const activeItem = subnavbarRef.value?.querySelector('.subnavitem-button.active');
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
}

const debouncedScrollActiveItemIntoView = useDebounceFn(scrollActiveItemIntoView, 100);

onClickOutside(subnavbarRef, (event) => {
  const target = event.target as HTMLElement;
  const menuIcon = target.closest('#menu-icon');
  const submenuIcon = target.closest('#submenu-icon');
  const navbarIcon = target.closest('#navbar-icon');
  if (!menuIcon && !submenuIcon && !navbarIcon) {
    closeNavbar();
  }
});

useResizeObserver(subnavbarRef, () => {
  debouncedScrollActiveItemIntoView();
});

watch(subState, (newState) => {
  if (newState && newState !== state.value) {
    state.value = newState;
  }
});

watch(router.currentRoute, (newRoute, oldRoute) => {
  if (newRoute.path !== oldRoute.path) {
    closeNavbar();
  }
});

watch(navbarState, (newState) => {
  if (newState === 'opened' && mdBreakpoint.value) {
    closeNavbar();
  }
});

onMounted(() => {
  scrollActiveItemIntoView();
});

defineExpose({
  subnavbarState,
});
</script>

<style scoped>
.cui-subnavbar {
  background: var(--subnavbar-background);
  border-right-style: solid;
  border-right-color: var(--border-color);
}
</style>
