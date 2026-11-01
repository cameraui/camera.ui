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
      bottom: bottomPadding,
      right: right || undefined,
    }"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { pageScrollY } from '@/common/pageScroll.js';

import type { CuiFloatingButtonGroupProps } from './types.js';

const props = withDefaults(defineProps<CuiFloatingButtonGroupProps>(), {
  direction: 'vertical',
  // undefined when absent, not cast to false: then the window scroll decides
  scrollHidden: undefined,
});

const { bottombarHeight } = useSharedCuiStates();

const { direction, forceVisible } = toRefs(props);

const pageY = ref(pageScrollY());
const windowHidden = useScrollHide(pageY);
const hidden = computed(() => props.scrollHidden ?? windowHidden.value);

const bottomPadding = computed(() => {
  const isBottomVisible = bottombarHeight.value > 0;
  const bottomOffetWithBar = 'calc(1.25rem + var(--safe-area-inset-bottom))';
  const bottomOffsetWithoutBar = 'calc(max(8px, var(--safe-area-inset-bottom)) + 0px)';
  const bottomOffset = isBottomVisible ? bottomOffetWithBar : bottomOffsetWithoutBar;
  return `calc(${bottombarHeight.value}px + ${bottomOffset})`;
});

function syncPageY() {
  pageY.value = pageScrollY();
}

useEventListener(window, 'scroll', useThrottleFn(syncPageY, 100, true), { passive: true });
</script>

<style scoped></style>
