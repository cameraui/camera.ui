<template>
  <CuiTileWidget
    :icon
    :title="name"
    :state="cameraName ?? typeLabel"
    :summary="stateText"
    :offline="!online || cameraDisabled"
    :hero="stateText"
    opens
    @open="emit('expand', $event)"
  >
    <template #default="{ form }">
      <p v-if="form === 'tall'" class="helper-widget__text">{{ t(`components.sensor_tile.helper_${sensor.type}`) }}</p>
    </template>
  </CuiTileWidget>
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileWidget from '../frame/CuiTileWidget.vue';
import { useCameraName } from '../useCameraRecord.js';
import { useTileSensor } from '../useTileSensor.js';
import { useDetection } from './useDetection.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online } = useTileSensor(props);
const { stateText, cameraDisabled } = useDetection(() => props.sensor);
const cameraName = useCameraName(props.sensor.boundCameraId);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const typeLabel = computed(() => t(`components.camera_options.sensor_type_${props.sensor.type}`));
</script>

<style scoped>
.helper-widget__text {
  font-size: 0.875rem;
  line-height: 1.4;
  color: var(--text-secondary-color);
}
</style>
