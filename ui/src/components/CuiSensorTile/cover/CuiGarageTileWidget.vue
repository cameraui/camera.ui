<template>
  <CuiTileWidget
    :icon
    :title="name"
    :state="hint ? t('components.sensor_tile.hold_to_open') : sinceText"
    :summary="hint ? t('components.sensor_tile.hold_to_open') : stateText"
    :color
    :active="wantsOpen || obstructed"
    :offline="!online"
    :hero="stateText"
    @open="emit('expand', $event)"
  >
    <template #extra>
      <CuiGarageScene class="garage-widget__scene" :open-ratio="doorRatio" :moving :obstructed />
    </template>

    <CuiTileHoldAction
      v-if="!disabled"
      show-label
      :icon="wantsOpen ? CloseIcon : OpenIcon"
      :label="t(`components.sensor_tile.${wantsOpen ? 'close' : 'open'}`)"
      :guarded="!wantsOpen"
      :interactive
      @press="wantsOpen ? close() : open()"
      @hint="hint = $event"
    />
  </CuiTileWidget>
</template>

<script setup lang="ts">
import { CoverProperty } from '@camera.ui/sdk';
import CloseIcon from '~icons/lucide/chevrons-down';
import OpenIcon from '~icons/lucide/chevrons-up';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileHoldAction from '../frame/CuiTileHoldAction.vue';
import CuiTileWidget from '../frame/CuiTileWidget.vue';
import { useSensorHistory } from '../useSensorHistory.js';
import { useTileSensor } from '../useTileSensor.js';
import CuiGarageScene from './CuiGarageScene.vue';
import { useCover } from './useCover.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { wantsOpen, doorRatio, moving, obstructed, color, stateText, open, close } = useCover(() => props.sensor);
const { sinceText } = useSensorHistory(
  () => props.sensor,
  () => CoverProperty.CurrentState,
);

const hint = ref(false);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
</script>

<style scoped>
.garage-scene.garage-widget__scene {
  width: auto;
  height: 100%;
  max-width: 100%;
}
</style>
