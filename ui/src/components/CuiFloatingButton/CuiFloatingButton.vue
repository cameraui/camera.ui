<template>
  <div
    class="transition-all duration-300 ease-in-out cui-icon-3xl"
    :class="[
      {
        'fixed right-safe-offset-5 z-10': !grouped,
        'scale-0 opacity-0': !grouped && !forceVisible && y > 10,
        'scale-100 opacity-100': !grouped && (forceVisible || y <= 10),
        'scale-110': isHovered,
      },
    ]"
    :style="!grouped ? { bottom: `calc(${bottombarHeight}px + 1.25rem + env(safe-area-inset-bottom, 0px))` } : undefined"
    v-element-hover="[onHover, {}]"
  >
    <Button v-bind="buttonProps" v-tooltip.left="tooltipProps" rounded @click="$emit('click')" :label="label" class="shadow-lg">
      <template v-if="icon" #icon>
        <component :is="icon" v-bind="iconProps" />
      </template>
    </Button>
  </div>
</template>

<script setup lang="ts">
import { vElementHover } from '@vueuse/components';

import type { CuiFloatingButtonEmits, CuiFloatingButtonProps } from './types.js';

const props = defineProps<CuiFloatingButtonProps>();

const emit = defineEmits<CuiFloatingButtonEmits>();

const { bottombarHeight } = useSharedCuiStates();

const { buttonProps, tooltipProps, label, icon, iconProps, grouped, forceVisible } = toRefs(props);
const isHovered = ref(false);

const { y } = useScroll(window, { throttle: 100 });

function onHover(state: boolean) {
  isHovered.value = state;
  emit('hover', state);
}

watch(
  y,
  () => {
    if (grouped?.value) return;
    if (forceVisible?.value || y.value <= 10) {
      emit('expand');
    } else {
      emit('shrink');
    }
  },
  { immediate: true, deep: true },
);
</script>

<style scoped></style>
