<template>
  <header
    class="cui-topbar fixed flex flex-row items-center top-0 left-0 right-0 pt-safe pr-safe draggable-region"
    :class="{
      '!border-none': smBreakpoint,
    }"
    :style="{
      height: `calc(${topbarHeight}px + var(--safe-area-inset-top) + ${TOPBAR_SIZE.ELECTRON_OFFSET}px)`,
      viewTransitionName: 'cui-topbar',
      background: smBreakpoint ? 'var(--ground-background)' : undefined,
      paddingTop: isElectronApp ? `calc(${TOPBAR_SIZE.ELECTRON_OFFSET}px + var(--safe-area-inset-top))` : undefined,
    }"
  >
    <div v-if="smBreakpoint && !minifiedTopbar" class="flex flex-row items-center flex-1 p-2 gap-1">
      <div class="flex-1 flex items-center justify-start min-w-0">
        <Button
          v-if="canToggleHostMenu"
          v-tooltip.bottom="$t('views.menu.home_assistant')"
          class="cui-button p-2 text-color non-draggable-region"
          severity="secondary"
          text
          @click="toggleHostMenu()"
        >
          <template #icon>
            <i-mdi:menu class="w-6 h-6" />
          </template>
        </Button>
        <CuiInstanceSwitcher
          v-if="!hasSlot('left') && hasPermission(undefined, 'admin') && router.currentRoute.value.name === 'Home' && isMultiInstance"
          class="cui-topbar-default non-draggable-region"
        />
        <div id="cui-topbar-left" class="cui-topbar-slot non-draggable-region" />
      </div>

      <div class="shrink-0 flex items-center justify-center min-w-0 cursor-pointer" @click="scrollToTop">
        <div id="cui-topbar-center" class="cui-topbar-slot truncate non-draggable-region" />
        <span v-if="!hasSlot('center')" class="cui-topbar-default font-semibold text-xl truncate">
          {{ $t(`views.${String($route.name).toLowerCase()}.title`) }}
        </span>
      </div>

      <div class="flex-1 flex items-center justify-end min-w-0">
        <div id="cui-topbar-right" class="cui-topbar-slot non-draggable-region" />
        <div class="cui-topbar-default">
          <CuiNotificationMenu class="non-draggable-region" />
        </div>
      </div>
    </div>

    <div
      v-else-if="!minifiedTopbar"
      class="flex flex-row items-center flex-1 p-2"
      :style="{
        'margin-left': `calc(${offsetLeft}px + max(8px, var(--safe-area-inset-left)))`,
        transition: animate ? 'margin-left 200ms' : undefined,
      }"
    >
      <CuiNavbarToggle class="non-draggable-region" />
      <CuiInstanceSwitcher v-if="hasPermission(undefined, 'admin') && isMultiInstance" class="non-draggable-region" />
      <CuiThemeSwitch v-if="!isHaPanel()" class="ml-auto non-draggable-region" />
      <CuiNotificationMenu class="non-draggable-region" :class="{ 'ml-auto': isHaPanel() }" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { isHaPanel } from '@/common/base.js';

import { TOPBAR_SIZE } from './types.js';

import type { CuiTopbarProps } from './types.js';

const props = defineProps<CuiTopbarProps>();

const router = useRouter();
const { smBreakpoint } = useSharedCuiBreakpoint();
const { hasSlot, scrollToTop } = useCuiTopbarSlots();
const { minifiedTopbar } = useRouteMeta();
const { topbarHeight } = useSharedCuiStates();
const { isElectronApp } = useElectron();
const { canToggle: canToggleHostMenu, toggle: toggleHostMenu } = useHostMenu();

const instanceStore = useInstanceStore();
const { isMultiInstance } = storeToRefs(instanceStore);

const { offsetLeft, animate } = toRefs(props);
</script>

<style scoped>
.cui-topbar {
  background: var(--topbar-background);
  border-bottom: 1px solid var(--border-color);
}
</style>
