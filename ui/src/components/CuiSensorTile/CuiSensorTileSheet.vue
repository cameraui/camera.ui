<template>
  <Popover ref="popoverRef" class="w-[22rem] shadow-lg cui-rounded-corner" :pt="{ content: { class: 'p-4' } }">
    <div class="flex flex-col gap-4">
      <component :is="large" :sensor size="large" :disabled class="sensor-sheet__tile" />
      <slot />
    </div>
  </Popover>

  <CuiBottomSheet v-model="sheetOpen">
    <div class="flex flex-col gap-4 pt-4">
      <component :is="large" :sensor size="large" :disabled class="sensor-sheet__tile" />
      <slot />
    </div>
  </CuiBottomSheet>
</template>

<script setup lang="ts">
import { SENSOR_TILES } from './tiles.js';

import type { Popover } from 'openvue';
import type { CuiSensorTileSheetProps } from './types.js';

const props = defineProps<CuiSensorTileSheetProps>();

const { phoneBreakpoint } = useSharedCuiBreakpoint();

const popoverRef = useTemplateRef<InstanceType<typeof Popover>>('popoverRef');
const sheetOpen = ref(false);

const large = computed(() => SENSOR_TILES[props.sensor.type]?.large);

function open(event: Event, anchor = event.currentTarget) {
  if (phoneBreakpoint.value) sheetOpen.value = true;
  else popoverRef.value?.toggle(event, anchor);
}

function close() {
  sheetOpen.value = false;
  popoverRef.value?.hide();
}

defineExpose({ open, close });
</script>

<style scoped>
.sensor-sheet__tile {
  --tile-panel-padding: 0;
  --tile-panel-border: none;
  --tile-panel-background: transparent;
}
</style>
