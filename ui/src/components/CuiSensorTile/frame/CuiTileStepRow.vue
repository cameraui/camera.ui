<template>
  <div class="tile-step-row">
    <CuiTileAction class="tile-step-row__step" :icon="MinusIcon" :label="downLabel" :interactive @click="emit('step', -1)" />
    <div class="tile-step-row__center">
      <slot />
    </div>
    <CuiTileAction class="tile-step-row__step" :icon="PlusIcon" :label="upLabel" :interactive @click="emit('step', 1)" />
  </div>
</template>

<script setup lang="ts">
import MinusIcon from '~icons/mdi/minus';
import PlusIcon from '~icons/mdi/plus';

import CuiTileAction from './CuiTileAction.vue';

import type { CuiTileStepRowEmits, CuiTileStepRowProps } from './types.js';

defineProps<CuiTileStepRowProps>();
const emit = defineEmits<CuiTileStepRowEmits>();
</script>

<style scoped>
.tile-step-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tile-step-row .tile-step-row__step {
  flex: 0 0 auto;
  aspect-ratio: 1;
  padding: 0;
  border-radius: 50%;
}

.tile-step-row__center {
  display: flex;
  justify-content: center;
  flex: 1;
  min-width: 0;
}
</style>
