<template>
  <CuiPopoverSheet ref="sheetRef" width="20rem" :popover="{ pt: { content: { class: 'p-4' } } }">
    <div class="flex flex-col gap-4">
      <component :is="large" :sensor size="large" :disabled class="sensor-sheet__tile" />
      <slot />
    </div>
  </CuiPopoverSheet>
</template>

<script setup lang="ts">
import CuiPopoverSheet from '../CuiPopoverSheet/CuiPopoverSheet.vue';
import { SENSOR_TILES } from './tiles.js';
import { TILE_WAIT } from './types.js';
import { useTileWait } from './useTileWait.js';

import type { CuiSensorTileSheetProps } from './types.js';

const props = defineProps<CuiSensorTileSheetProps>();

const sheetRef = useTemplateRef<InstanceType<typeof CuiPopoverSheet>>('sheetRef');

const large = computed(() => SENSOR_TILES[props.sensor.type]?.large);

function open(event: Event, target: EventTarget | null = event.currentTarget) {
  sheetRef.value?.toggle(event, target);
}

function close() {
  sheetRef.value?.hide();
}

if (!inject(TILE_WAIT, undefined)) {
  provide(
    TILE_WAIT,
    useTileWait(() => props.sensor),
  );
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
