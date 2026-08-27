<template>
  <div
    class="fixed z-10 flex transition-all duration-200 ease-in-out"
    :class="{
      'right-safe-offset-5': !right,
      'flex-col': direction === 'vertical',
      'flex-row': direction === 'horizontal',
      'scale-0 opacity-0': !forceVisible && hidden,
      'scale-100 opacity-100': forceVisible || !hidden,
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

const TOP_PX = 10;
const HIDE_AFTER_PX = 24;
const REVEAL_AFTER_PX = 12;

const props = withDefaults(defineProps<CuiFloatingButtonGroupProps>(), {
  direction: 'vertical',
});

const { bottombarHeight } = useSharedCuiStates();

const { direction, forceVisible } = toRefs(props);
const hidden = ref(false);

let lastY = 0;
let travelled = 0;

const { y: windowY } = useScroll(window, { throttle: 100 });
const y = computed(() => props.scrollY ?? windowY.value);

watch(y, (now) => {
  const delta = now - lastY;
  lastY = now;
  if (now <= TOP_PX) {
    hidden.value = false;
    travelled = 0;
    return;
  }
  if (delta === 0) return;
  if (Math.sign(delta) !== Math.sign(travelled)) travelled = 0;
  travelled += delta;
  if (travelled > HIDE_AFTER_PX) hidden.value = true;
  else if (travelled < -REVEAL_AFTER_PX) hidden.value = false;
});
</script>

<style scoped></style>
