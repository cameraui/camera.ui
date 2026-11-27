<template>
  <CuiTileWidget
    :icon
    :title="name"
    :state="kindLabel"
    :summary
    :color
    :active="isOpen || obstructed"
    :offline="!online"
    :hero="hasPosition ? `${position} %` : stateText"
    :hero-note="hasPosition ? stateText : undefined"
    @open="emit('expand', $event)"
  >
    <template v-if="!disabled" #default="{ form }">
      <CuiLevelBar
        v-if="form === 'tall' && hasPosition"
        :value="openRatio"
        :label="stateText"
        :color
        :disabled="!interactive"
        @input="(ratio) => inputPosition(Math.round(ratio * 100))"
        @commit="(ratio) => commitPosition(Math.round(ratio * 100))"
      />

      <div class="cover-widget__actions">
        <CuiTileAction :icon="OpenIcon" :label="t('components.sensor_tile.open')" :active="current === CoverState.Opening" :interactive v-on="listeners('up')" />
        <CuiTileAction v-if="canStop" :icon="StopIcon" :label="t('components.sensor_tile.stop')" :interactive @click="stop" />
        <CuiTileAction :icon="CloseIcon" :label="t('components.sensor_tile.close')" :active="current === CoverState.Closing" :interactive v-on="listeners('down')" />
      </div>
    </template>
  </CuiTileWidget>
</template>

<script setup lang="ts">
import { CoverState } from '@camera.ui/sdk';
import CloseIcon from '~icons/lucide/chevrons-down';
import OpenIcon from '~icons/lucide/chevrons-up';
import StopIcon from '~icons/lucide/square';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiLevelBar from '../frame/CuiLevelBar.vue';
import CuiTileAction from '../frame/CuiTileAction.vue';
import CuiTileWidget from '../frame/CuiTileWidget.vue';
import { useTileSensor } from '../useTileSensor.js';
import { useCover, useCoverPress } from './useCover.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const cover = useCover(() => props.sensor);
const { kind, hasPosition, canStop, current, obstructed, position, isOpen, openRatio, color, stateText, summary, stop, inputPosition, commitPosition } = cover;
const { listeners } = useCoverPress(cover, () => interactive.value);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const kindLabel = computed(() => t(`components.camera_options.sensor_kind_${kind.value}`));
</script>

<style scoped>
.cover-widget__actions {
  display: flex;
  gap: 0.5rem;
}
</style>
