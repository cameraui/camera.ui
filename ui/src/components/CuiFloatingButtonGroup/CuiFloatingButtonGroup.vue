<template>
  <div
    class="cui-fab-group z-10"
    :class="[
      contained ? 'absolute' : 'fixed',
      `cui-fab-group--${side}`,
      {
        'cui-fab-group--mini': collapsed,
        'cui-fab-group--hidden': hidden,
      },
    ]"
    :style="position"
    @pointerenter="onPointerEnter"
    @pointerleave="hovered = false"
    @focusin="focused = true"
    @focusout="focused = false"
  >
    <div class="cui-fab-group__stack flex" :class="direction === 'vertical' ? 'flex-col' : 'flex-row'" :inert="collapsed || undefined">
      <slot />
    </div>
    <button
      v-if="collapsible"
      type="button"
      class="cui-fab-group__dot"
      :tabindex="collapsed ? 0 : -1"
      :aria-label="$t('components.floating_buttons.show')"
      @click="expand"
    />
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
const hovered = ref(false);
const focused = ref(false);

const { mini, expand } = useFloatingMini(
  () => props.scrollY ?? pageY.value,
  () => !props.collapsible || hovered.value || focused.value || props.forceVisible,
);

const collapsed = computed(() => props.collapsible && mini.value && !props.forceVisible);

const position = computed(() => {
  if (props.contained) return { bottom: '0.75rem', [props.side]: '0.75rem' };
  return {
    bottom: 'var(--cui-fab-bottom)',
    [props.side]: props.offset ?? `calc(1.25rem + var(--safe-area-inset-${props.side}))`,
  };
});

function onPointerEnter(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return;
  hovered.value = true;
  expand();
}

function syncPageY() {
  pageY.value = pageScrollY();
}

watch(focused, (now) => {
  if (now) expand();
});

useEventListener(window, 'scroll', useThrottleFn(syncPageY, 100, true), { passive: true });
</script>

<style scoped>
.cui-fab-group {
  --cui-fab-anchor: 1.5rem;
  --cui-fab-dot: 0.875rem;
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

.cui-fab-group__stack {
  transform-origin: calc(100% - var(--cui-fab-anchor)) calc(100% - var(--cui-fab-anchor));
  transition:
    transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 200ms ease-out;
}

.cui-fab-group--left .cui-fab-group__stack {
  transform-origin: var(--cui-fab-anchor) calc(100% - var(--cui-fab-anchor));
}

.cui-fab-group--mini {
  pointer-events: none;
}

.cui-fab-group--mini .cui-fab-group__stack {
  transform: scale(0.1);
  opacity: 0;
  transition:
    transform 320ms cubic-bezier(0.55, 0, 0.75, 0),
    opacity 220ms ease-in 100ms;
}

.cui-fab-group__dot {
  position: absolute;
  bottom: calc(var(--cui-fab-anchor) - var(--cui-fab-dot) / 2);
  right: calc(var(--cui-fab-anchor) - var(--cui-fab-dot) / 2);
  width: var(--cui-fab-dot);
  height: var(--cui-fab-dot);
  border-radius: 9999px;
  background: var(--p-primary-color);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--p-primary-color) 25%, transparent),
    0 2px 6px rgb(0 0 0 / 0.3);
  opacity: 0;
  transform: scale(0);
  pointer-events: none;
  cursor: pointer;
  transition:
    transform 160ms ease-in,
    opacity 120ms ease-in;
}

.cui-fab-group__dot::before {
  content: '';
  position: absolute;
  inset: -0.875rem;
  border-radius: inherit;
}

.cui-fab-group--left .cui-fab-group__dot {
  right: auto;
  left: calc(var(--cui-fab-anchor) - var(--cui-fab-dot) / 2);
}

.cui-fab-group--mini .cui-fab-group__dot {
  opacity: 1;
  transform: scale(1);
  pointer-events: auto;
  transition:
    transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1) 180ms,
    opacity 150ms ease-out 180ms;
}
</style>
