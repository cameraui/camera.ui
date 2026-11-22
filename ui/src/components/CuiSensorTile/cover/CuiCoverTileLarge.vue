<template>
  <CuiTilePanel :icon :title="name" :state="summary" :color :active="isOpen || obstructed" :offline="!online">
    <div class="flex justify-center">
      <CuiCoverScene
        :kind
        :open-ratio="openRatio"
        :tilt="hasTilt ? tilt : undefined"
        :obstructed
        :draggable="hasPosition && interactive"
        @input="(ratio) => inputPosition(Math.round(ratio * 100))"
        @commit="(ratio) => commitPosition(Math.round(ratio * 100))"
      />
    </div>

    <div class="flex justify-center gap-4">
      <CuiTileButton :icon="OpenIcon" :label="t('components.sensor_tile.open')" :color :active="current === CoverState.Opening" :interactive @click="open" />
      <CuiTileButton v-if="canStop" :icon="StopIcon" :label="t('components.cover_control.stop')" :color :interactive @click="stop" />
      <CuiTileButton :icon="CloseIcon" :label="t('components.sensor_tile.close')" :color :active="current === CoverState.Closing" :interactive @click="close" />
    </div>

    <div v-if="hasTilt" class="flex flex-col gap-2">
      <span class="text-xs font-medium text-muted">{{ t('components.sensor_tile.slats') }}</span>
      <CuiLevelBar
        :value="tilt / 100"
        :label="`${tilt} %`"
        :aria-label="t('components.sensor_tile.slats')"
        :color
        :disabled="!interactive"
        @input="(ratio) => inputTilt(Math.round(ratio * 100))"
        @commit="(ratio) => commitTilt(Math.round(ratio * 100))"
      />
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import { CoverState } from '@camera.ui/sdk';
import CloseIcon from '~icons/lucide/chevrons-down';
import OpenIcon from '~icons/lucide/chevrons-up';
import StopIcon from '~icons/lucide/square';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiLevelBar from '../frame/CuiLevelBar.vue';
import CuiTileButton from '../frame/CuiTileButton.vue';
import CuiTilePanel from '../frame/CuiTilePanel.vue';
import { useTileSensor } from '../useTileSensor.js';
import CuiCoverScene from './CuiCoverScene.vue';
import { useCover } from './useCover.js';

import type { SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const {
  kind,
  hasPosition,
  hasTilt,
  canStop,
  current,
  obstructed,
  tilt,
  isOpen,
  openRatio,
  color,
  summary,
  open,
  close,
  stop,
  inputPosition,
  commitPosition,
  inputTilt,
  commitTilt,
} = useCover(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
</script>
