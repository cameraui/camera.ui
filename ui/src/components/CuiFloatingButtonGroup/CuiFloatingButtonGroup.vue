<template>
  <div
    class="cui-fab-group z-10 flex"
    :class="[contained ? 'absolute' : 'fixed', direction === 'vertical' ? 'flex-col' : 'flex-row', { 'cui-fab-group--hidden': isHidden }]"
    :style="position"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { pageScrollY } from '@/common/pageScroll.js';

import type { CuiFloatingButtonGroupProps } from './types.js';

const props = withDefaults(defineProps<CuiFloatingButtonGroupProps>(), {
  direction: 'vertical',
  side: 'right',
});

const pageY = ref(pageScrollY());

const scrollHidden = useScrollHide(() => props.scrollY ?? pageY.value);

const isHidden = computed(() => props.hidden || (scrollHidden.value && !props.forceVisible));

const position = computed(() => {
  if (props.contained) return { bottom: '0.75rem', [props.side]: '0.75rem' };
  return {
    bottom: props.bottom ?? 'var(--cui-fab-bottom)',
    [props.side]: props.offset ?? `calc(1.25rem + var(--safe-area-inset-${props.side}))`,
  };
});

function syncPageY() {
  pageY.value = pageScrollY();
}

useEventListener(window, 'scroll', useThrottleFn(syncPageY, 100, true), { passive: true });
</script>

<style scoped>
.cui-fab-group {
  transition:
    bottom 200ms ease-in-out,
    left 200ms ease-in-out,
    right 200ms ease-in-out,
    transform 200ms ease-in-out,
    opacity 200ms ease-in-out;
}

.cui-fab-group--hidden {
  transform: scale(0);
  opacity: 0;
  pointer-events: none;
}
</style>
