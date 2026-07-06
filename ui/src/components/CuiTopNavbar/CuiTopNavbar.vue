<template>
  <div
    class="cui-topnavbar fixed h-[55px] w-full p-2 pr-safe-offset-2 z-2 left-0 right-0"
    :class="{
      'overflow-x-scroll': scrollable,
      // '!border-none': smBreakpoint,
    }"
    :style="{
      paddingLeft: `calc(${leftOffset}px + max(8px, env(safe-area-inset-left, 0px)))`,
      transition: animate ? 'padding-left 200ms' : undefined,
      // background: smBreakpoint ? 'var(--ground-background)' : undefined,
    }"
  >
    <div class="flex flex-row w-full h-full justify-between items-center gap-2">
      <template v-if="$slots.full">
        <div class="flex flex-row items-center gap-1 w-full" :class="{ 'overflow-x-auto hide-scrollbar': scrollable }">
          <slot name="full" />
        </div>
      </template>

      <template v-else>
        <div class="flex flex-row items-center gap-1 min-w-0" :class="{ 'overflow-x-auto hide-scrollbar': scrollable }">
          <slot name="left" />
        </div>

        <div class="flex-grow shrink" />

        <div class="flex flex-row items-center gap-1 shrink-0">
          <slot name="right" />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CuiTopNavbarProps } from './types.js';

const props = withDefaults(defineProps<CuiTopNavbarProps>(), {
  scrollable: false,
  leftOffset: 0,
});

const { scrollable, leftOffset, animate } = toRefs(props);
</script>

<style scoped>
.cui-topnavbar {
  background: var(--topnavbar-background);
  border-bottom: 1px solid var(--topnavbar-border-color);
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
