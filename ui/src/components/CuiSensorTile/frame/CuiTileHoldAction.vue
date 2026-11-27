<template>
  <CuiTileAction
    ref="actionRef"
    class="tile-hold-action"
    :icon
    :label
    :show-label
    :color
    :active
    :interactive
    :progress="holding ? progress : undefined"
    :waiting
    :failed
    @keydown="onKey"
  />
</template>

<script setup lang="ts">
import { useGuardedPress } from '../useGuardedPress.js';
import CuiTileAction from './CuiTileAction.vue';

import type { CuiTileHoldActionEmits, CuiTileHoldActionProps } from './types.js';
import type { ComponentPublicInstance } from 'vue';

const props = withDefaults(defineProps<CuiTileHoldActionProps>(), {
  active: undefined,
});
const emit = defineEmits<CuiTileHoldActionEmits>();

const actionRef = useTemplateRef<ComponentPublicInstance>('actionRef');
const actionEl = computed(() => actionRef.value?.$el as HTMLElement | undefined);

const { progress, holding, hint, onKey } = useGuardedPress(actionEl, {
  interactive: () => props.interactive,
  guarded: () => props.guarded,
  onGuarded: () => emit('press'),
  onTap: () => emit('press'),
  onToggle: () => emit('press'),
});

watch([hint, holding], ([shown, held]) => emit('hint', shown || held));
</script>

<style scoped>
.tile-hold-action {
  -webkit-touch-callout: none;
}
</style>
