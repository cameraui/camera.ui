<template>
  <nav
    ref="bottombarRef"
    class="cui-bottombar bottombar-background fixed bottom-0 left-0 right-0 border-t-[1px] border-color bottombar-background"
    :style="{
      height: `calc(${bottombarHeight}px + env(safe-area-inset-bottom, 0px))`,
      viewTransitionName: 'cui-bottombar',
    }"
  >
    <div
      class="px-2 h-full flex items-center justify-around"
      :style="{
        paddingBottom: 'calc(max(8px, env(safe-area-inset-bottom, 0px)))',
      }"
    >
      <CuiNavItem
        v-for="route in bottomRoutes"
        :key="route.name"
        :icon="route.meta!.bottombar!.icon.default"
        :active-icon="route.meta!.bottombar!.icon.active"
        active-icon-color="var(--p-primary-color)"
        :to="route.path"
        label=""
        :expanded="false"
        icon-class="text-color"
        class="w-[50px] h-[50px] transition-all duration-300"
        bottom-bar
      />
    </div>
  </nav>
</template>

<script setup lang="ts">
import { routes } from '@/router/index.js';

const { bottombarHeight } = useSharedCuiStates();

const bottombarRef = useTemplateRef('bottombarRef');

const bottomRoutes = computed<RouteRecordRaw[]>(() => routes.filter((route) => route.meta?.bottombar && route.meta.auth && hasPermission(route)));

defineExpose({
  bottombarRef,
});
</script>

<style scoped>
.cui-bottombar::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.05), transparent);
}
</style>

<style></style>
