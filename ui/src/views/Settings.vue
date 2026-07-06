<template>
  <div>
    <CuiTopbarSlot position="center">
      <span class="font-semibold text-xl truncate">{{ $t(`views.settings.title_${$route.meta?.name!}`) }}</span>
    </CuiTopbarSlot>

    <CuiTopbarSlot position="left">
      <Button
        id="menu-icon"
        class="cui-button relative group p-2 transition-colors duration-100 w-[40px] h-[42px] flex items-center justify-center"
        severity="secondary"
        text
        @click="toggleNavbar"
      >
        <div class="relative flex overflow-hidden items-center justify-center w-5 h-5">
          <div class="flex flex-col justify-between w-4 h-3 transform transition-all duration-100 origin-center overflow-hidden">
            <div
              class="h-0.5 w-2 transform transition-all duration-100 origin-center"
              :class="{
                'w-4 rotate-45 translate-y-[5px]': subnavbarState === 'opened',
              }"
              :style="{
                backgroundColor: 'var(--text-color)',
              }"
            />
            <div
              class="h-0.5 w-4 rounded transform transition-all duration-100"
              :class="{
                'opacity-0': subnavbarState === 'opened',
              }"
              :style="{
                backgroundColor: 'var(--text-color)',
              }"
            />
            <div
              class="h-0.5 w-3 transform transition-all duration-100 origin-center"
              :class="{
                'w-4 -rotate-45 -translate-y-[5px]': subnavbarState === 'opened',
              }"
              :style="{
                backgroundColor: 'var(--text-color)',
              }"
            />
          </div>
        </div>
      </Button>
    </CuiTopbarSlot>

    <CuiSubNavbar ref="subnavbarRef" class="z-4 min-w-0" />

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
            'py-4': smBreakpoint,
            'pt-[calc(40px+2rem)] pb-2': !smBreakpoint,
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
import type { UsePointerSwipeOptions, UseSwipeOptions } from '@vueuse/core';

const router = useRouter();
const routeMeta = useRouteMeta();
const { bus } = useCuiBus();
const { isTouch } = useSharedCuiUserAgent();
const { mdBreakpoint, xlBreakpoint, smBreakpoint } = useSharedCuiBreakpoint();

const loadingStore = useRouterStore();
const { routerLoading } = storeToRefs(loadingStore);

const uiRoutes = routes.find((route) => route.name === 'Settings')!.children!.filter((route) => hasPermission(route) && route.meta?.settingsBar);

const subnavbarRef = useTemplateRef<InstanceType<typeof CuiSubNavbar>>('subnavbarRef');
const containerRef = useTemplateRef('containerRef');
const allowSipe = ref(true);

const swipeOptions: UseSwipeOptions = {
  threshold: 50,
  onSwipeStart(e) {
    const target = e.target as HTMLElement;
    const interactiveElements = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'];
    if (interactiveElements.includes(target.tagName) || target.closest('.p-datatable')) {
      allowSipe.value = false;
    }
  },
  onSwipeEnd() {
    allowSipe.value = true;
  },
};

const pointerSwipeOptions: UsePointerSwipeOptions = {
  threshold: 50,
  onSwipeStart(e) {
    const target = e.target as HTMLElement;
    const interactiveElements = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'];
    if (interactiveElements.includes(target.tagName) || target.closest('.p-datatable')) {
      allowSipe.value = false;
    }
  },
  onSwipeEnd() {
    allowSipe.value = true;
  },
};

const { isSwiping, direction } = isTouch.value ? useSwipe(containerRef, swipeOptions) : usePointerSwipe(containerRef, pointerSwipeOptions);
const subnavbarEl = useElementSize(subnavbarRef);

const subnavbarState = computed<SubNavbarState>(() => subnavbarRef.value?.subnavbarState ?? 'closed');

function toggleNavbar() {
  const state = subnavbarState.value === 'opened' ? 'closed' : 'opened';
  bus.emit({ subbarState: state });
}

watch([isSwiping, direction], () => {
  if (isSwiping.value && allowSipe.value) {
    const oldRouteIndex = uiRoutes.findIndex((route) => route.path === router.currentRoute.value.path.split('/settings/')[1]);

    switch (direction.value) {
      case 'right':
        {
          const newRoute = uiRoutes[oldRouteIndex - 1];

          if (newRoute) {
            router.push({ path: newRoute.path });
          }
        }
        break;
      case 'left':
        {
          const newRoute = uiRoutes[oldRouteIndex + 1];

          if (newRoute) {
            router.push({ path: newRoute.path });
          }
        }
        break;
    }
  }
});
</script>

<style scoped></style>
