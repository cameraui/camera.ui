<template>
  <CuiTileWidget
    :icon
    :title="name"
    :state="typeLabel"
    :summary="stateText"
    :color
    :active
    :offline="!online"
    :hero="stateText"
    extra-shows-hero
    :opens="!runnable && sensor.type !== SensorType.Doorbell"
    @open="emit('expand', $event)"
  >
    <template #extra>
      <div class="event-widget__moments">
        <CuiTileMoments :sensor :moments :loaded :describe />
      </div>
    </template>

    <template v-if="!disabled">
      <CuiTileAction v-if="runnable" show-label :icon="RunIcon" :label="t('components.scene_control.run')" :color :active :interactive @click="run" />
      <CuiTileAction
        v-else-if="sensor.type === SensorType.Doorbell"
        show-label
        :icon="RingIcon"
        :label="t('components.sensor_tile.ring')"
        :color
        :active
        :interactive="interactive && !active"
        @click="ring"
      />
    </template>
  </CuiTileWidget>
</template>

<script setup lang="ts">
import { SensorType } from '@camera.ui/sdk';
import RingIcon from '~icons/mdi/bell-ring';
import RunIcon from '~icons/mdi/play';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileAction from '../frame/CuiTileAction.vue';
import CuiTileMoments from '../frame/CuiTileMoments.vue';
import CuiTileWidget from '../frame/CuiTileWidget.vue';
import { useTileSensor } from '../useTileSensor.js';
import { useEventSensor } from './useEventSensor.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { runnable, moments, loaded, active, color, stateText, describe, run, ring } = useEventSensor(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const typeLabel = computed(() => t(`components.camera_options.sensor_type_${props.sensor.type}`));
</script>

<style scoped>
.event-widget__moments {
  align-self: stretch;
  flex: 1;
  min-width: 0;
  mask-image: linear-gradient(#000 75%, transparent);
}
</style>
