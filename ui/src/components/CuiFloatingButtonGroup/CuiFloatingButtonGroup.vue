<template>
  <div
    class="fixed z-10 flex transition-all duration-200 ease-in-out"
    :class="{
      'right-safe-offset-5': !right,
      'flex-col': direction === 'vertical',
      'flex-row': direction === 'horizontal',
      'scale-0 opacity-0': !forceVisible && y > 10,
      'scale-100 opacity-100': forceVisible || y <= 10,
    }"
    :style="{
      bottom: `calc(${bottombarHeight}px + 1.25rem + env(safe-area-inset-bottom, 0px))`,
      right: right || undefined,
    }"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import type { CuiFloatingButtonGroupProps } from './types.js';

const props = withDefaults(defineProps<CuiFloatingButtonGroupProps>(), {
  direction: 'vertical',
});

const { bottombarHeight } = useSharedCuiStates();

const { direction, forceVisible } = toRefs(props);

const { y } = useScroll(window, { throttle: 100 });
</script>

<style scoped></style>
