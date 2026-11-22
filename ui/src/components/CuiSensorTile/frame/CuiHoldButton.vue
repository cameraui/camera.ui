<template>
  <span class="hold-button">
    <CuiTileButton ref="buttonRef" :icon :label :color :active :interactive @keydown="onKey" />
    <CuiHoldRing v-if="holding" class="hold-button__ring" holding :progress />
  </span>
</template>

<script setup lang="ts">
import { useGuardedPress } from '../useGuardedPress.js';
import CuiHoldRing from './CuiHoldRing.vue';
import CuiTileButton from './CuiTileButton.vue';

import type { CuiHoldButtonEmits, CuiHoldButtonProps } from './types.js';
import type { ComponentPublicInstance } from 'vue';

const props = defineProps<CuiHoldButtonProps>();
const emit = defineEmits<CuiHoldButtonEmits>();

const buttonRef = useTemplateRef<ComponentPublicInstance>('buttonRef');
const buttonEl = computed(() => buttonRef.value?.$el as HTMLElement | undefined);

const { progress, holding, hint, onKey } = useGuardedPress(buttonEl, {
  interactive: () => props.interactive,
  guarded: () => props.guarded,
  onGuarded: () => emit('press'),
  onTap: () => emit('press'),
  onToggle: () => emit('press'),
});

watch([hint, holding], ([shown, held]) => emit('hint', shown || held));
</script>

<style scoped>
.hold-button {
  position: relative;
  display: inline-flex;
  -webkit-touch-callout: none;
}

.hold-button__ring {
  inset: -0.3125rem;
  width: calc(100% + 0.625rem);
  height: calc(100% + 0.625rem);
}
</style>
