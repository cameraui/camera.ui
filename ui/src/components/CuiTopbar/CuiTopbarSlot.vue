<template>
  <Teleport v-if="smBreakpoint && showTopbar" :to="`#cui-topbar-${position}`" defer>
    <slot />
  </Teleport>
</template>

<script setup lang="ts">
import type { CuiTopbarSlotProps } from './types.js';

const props = defineProps<CuiTopbarSlotProps>();

const { smBreakpoint } = useSharedCuiBreakpoint();
const { showTopbar } = useSharedCuiStates();
const { registerSlot } = useCuiTopbarSlots();

registerSlot(props.position);
</script>
