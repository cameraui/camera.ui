<template>
  <div v-if="tiles" class="sensor-tile" :class="{ 'sensor-tile--in-place': expandInPlace, 'sensor-tile--open': expandInPlace && expanded }">
    <div v-if="expandInPlace && expanded" class="sensor-tile__surface">
      <Button text size="small" severity="secondary" class="self-start" :label="t('components.sensor_tile.back')" @click="expanded = false">
        <template #icon>
          <i-mdi:arrow-left />
        </template>
      </Button>
      <component :is="tiles.large" :sensor size="large" :disabled class="sensor-tile__in-place" />
      <slot />
    </div>
    <component :is="tiles[size]" v-else :sensor :size :disabled @expand="expand" />

    <CuiSensorTileSheet v-if="size !== 'large' && !expandInPlace" ref="sheetRef" :sensor :disabled>
      <slot />
    </CuiSensorTileSheet>
  </div>
</template>

<script setup lang="ts">
import CuiSensorTileSheet from './CuiSensorTileSheet.vue';
import { SENSOR_TILES } from './tiles.js';
import { TILE_EXPAND, TILE_WAIT } from './types.js';
import { useTileWait } from './useTileWait.js';

import type { CuiSensorTileProps } from './types.js';

const props = withDefaults(defineProps<CuiSensorTileProps>(), {
  size: 'medium',
  disabled: false,
  expandInPlace: false,
});

const expanded = defineModel<boolean>('expanded', { default: false });

const { t } = useI18n();

const sheetRef = useTemplateRef<InstanceType<typeof CuiSensorTileSheet>>('sheetRef');

const tiles = computed(() => SENSOR_TILES[props.sensor.type]);

function expand(event: Event) {
  if (props.expandInPlace) expanded.value = true;
  else sheetRef.value?.open(event);
}

provide(TILE_EXPAND, expand);
provide(
  TILE_WAIT,
  useTileWait(() => props.sensor),
);
</script>

<style scoped>
.sensor-tile {
  min-width: 0;
}

.sensor-tile--in-place {
  width: 15rem;
  max-width: calc(100vw - 3rem);
}

.sensor-tile--open {
  width: 22rem;
}

.sensor-tile__surface {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  border-radius: 1.25rem;
  background: var(--p-content-background);
  border: 1px solid var(--border-color);
}

.sensor-tile__in-place {
  --tile-panel-padding: 0;
  --tile-panel-border: none;
  --tile-panel-background: transparent;
}
</style>
