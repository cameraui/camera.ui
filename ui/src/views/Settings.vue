<template>
  <div>
    <CuiTopbarSlot position="center">
      <span class="font-semibold text-xl truncate">{{ $t(`views.settings.title_${$route.meta?.name!}`) }}</span>
    </CuiTopbarSlot>

    <CuiTopbarSlot position="left">
      <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="$router.push(isListRoute ? '/menu' : '/settings')">
        <template #icon>
          <i-weui:back-filled class="w-6 h-6" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <CuiSubNavbar v-if="!smBreakpoint" ref="subnavbarRef" class="z-4 min-w-0" />

    <main
      class="relative w-full h-full"
      :style="{
        paddingLeft: mdBreakpoint ? '0px' : `${subnavbarEl.width.value}px`,
      }"
    >
      <div class="w-full h-full relative">
        <div v-if="!smBreakpoint" class="w-full flex flex-row h-[calc(40px+1rem)] py-2 items-center fixed z-2">
          <div class="ml-2" />

          <Button v-if="!xlBreakpoint" id="submenu-icon" severity="secondary" class="mr-2 cui-icon-lg relative z-2" text rounded @click="toggleNavbar">
            <template #icon>
              <i-solar:round-alt-arrow-left-bold v-if="subnavbarState === 'opened'" width="100%" height="100%" />
              <i-solar:round-alt-arrow-right-bold v-else width="100%" height="100%" />
            </template>
          </Button>

          <h1 class="relative z-2 page-title !m-0">
            {{ $t(`views.settings.title_${$route.meta?.name!}`) }}
          </h1>

          <div class="gradient-blur rotate-180 !h-[70px]">
            <div></div>
            <div></div>
            <div></div>
            <div></div>
            <div></div>
            <div></div>
          </div>
        </div>

        <div
          ref="containerRef"
          class="px-2 h-full w-full"
          :class="{
            'pt-4': smBreakpoint,
            'pt-[calc(40px+2rem)]': !smBreakpoint,
          }"
        >
          <CuiRouterLoading v-if="routerLoading && routeMeta.showRouterLoadingSub.value" class="w-full h-full relative overflow-x-hidden" />
          <RouterView v-else v-slot="{ Component }">
            <component :is="Component" class="h-full" />
          </RouterView>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { routes } from '@/router/index.js';

import type CuiSubNavbar from '@/components/CuiSubNavbar/CuiSubNavbar.vue';
import type { SubNavbarState } from '@/components/CuiSubNavbar/types.js';

const router = useRouter();
const routeMeta = useRouteMeta();
const { bus } = useCuiBus();
const { mdBreakpoint, xlBreakpoint, smBreakpoint } = useSharedCuiBreakpoint();

const loadingStore = useRouterStore();
const { routerLoading } = storeToRefs(loadingStore);

const uiRoutes = (['personal', 'system'] as const).flatMap((group) =>
  routes
    .find((route) => route.name === 'Settings')!
    .children!.filter((route) => hasPermission(route) && route.meta?.settingsBar && (route.meta.settingsBar.group ?? 'personal') === group),
);

const subnavbarRef = useTemplateRef<InstanceType<typeof CuiSubNavbar>>('subnavbarRef');
const containerRef = useTemplateRef('containerRef');

const isListRoute = computed(() => router.currentRoute.value.path === '/settings');

useTabSwipe(containerRef, (swipeDirection) => {
  if (isListRoute.value) return;

  const oldRouteIndex = uiRoutes.findIndex((route) => route.path === router.currentRoute.value.path.split('/settings/')[1]);
  const newRoute = swipeDirection === 'right' ? uiRoutes[oldRouteIndex - 1] : uiRoutes[oldRouteIndex + 1];

  if (newRoute) {
    router.push({ path: newRoute.path });
  }
});

const subnavbarEl = useElementSize(subnavbarRef);

const subnavbarState = computed<SubNavbarState>(() => subnavbarRef.value?.subnavbarState ?? 'closed');

function toggleNavbar() {
  const state = subnavbarState.value === 'opened' ? 'closed' : 'opened';
  bus.emit({ subbarState: state });
}

watch(smBreakpoint, (isMobile) => {
  if (!isMobile && isListRoute.value) {
    const view = useUiStore().uiSettings.interface.selectedSettingsView;
    router.replace(`/settings/${settingsViews.includes(view) ? view : 'account'}`);
  }
});
</script>

<style scoped></style>
