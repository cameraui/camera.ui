<template>
  <Button
    v-if="!xlBreakpoint || uiSettings.interface.navbarStayCollapsed"
    id="menu-icon"
    class="cui-button relative group p-2 transition-colors duration-100"
    severity="secondary"
    text
    @click="toggleNavbar"
  >
    <div class="relative flex overflow-hidden items-center justify-center w-5 h-5">
      <div class="flex flex-col justify-between w-4 h-3 transform transition-all duration-100 origin-center overflow-hidden">
        <div
          class="h-0.5 w-2 transform transition-all duration-100 origin-center"
          :class="{
            'w-4 rotate-45 translate-y-[5px]': navbarState,
          }"
          :style="{
            backgroundColor: 'var(--text-color)',
          }"
        />
        <div
          class="h-0.5 w-4 rounded transform transition-all duration-100"
          :class="{
            'opacity-0': navbarState,
          }"
          :style="{
            backgroundColor: 'var(--text-color)',
          }"
        />
        <div
          class="h-0.5 w-3 transform transition-all duration-100 origin-center"
          :class="{
            'w-4 -rotate-45 -translate-y-[5px]': navbarState,
          }"
          :style="{
            backgroundColor: 'var(--text-color)',
          }"
        />
      </div>
    </div>
  </Button>
</template>

<script setup lang="ts">
import type { NavbarState } from '@/components/CuiNavbar/types.js';

const { bus } = useCuiBus();
const { navbarState: navState } = useSharedCuiStates();
const { xlBreakpoint } = useSharedCuiBreakpoint();

const uiStore = useUiStore();
const { uiSettings } = storeToRefs(uiStore);

const state = ref<NavbarState>('closed');

const navbarState = computed(() => state.value === 'opened');

function toggleNavbar() {
  bus.emit({ navbarState: state.value === 'opened' ? 'closed' : 'opened' });
}

watch(navState, (newState) => {
  if (newState && newState !== state.value) {
    state.value = newState === 'minified' || newState === 'closed' ? 'closed' : 'opened';
  }
});
</script>

<style scoped></style>
