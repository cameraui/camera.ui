<template>
  <Teleport v-if="smBreakpoint" :to="`#cui-topbar-${position}`" defer>
    <slot />
  </Teleport>
</template>

<script setup lang="ts">
import type { CuiTopbarSlotProps } from './types.js';

const props = defineProps<CuiTopbarSlotProps>();

const { smBreakpoint } = useSharedCuiBreakpoint();
const { registerSlot } = useCuiTopbarSlots();

registerSlot(props.position);
</script>
