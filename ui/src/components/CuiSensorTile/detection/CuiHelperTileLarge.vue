<template>
  <CuiTilePanel :icon :title="name" :state="cameraName ?? typeLabel" :offline="!online">
    <div class="flex flex-col items-center gap-4 py-2">
      <span class="helper-large__icon">
        <component :is="icon" />
      </span>
      <CuiTileReading :state="stateText" :detail="t(`components.sensor_tile.helper_${sensor.type}`)" />
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTilePanel from '../frame/CuiTilePanel.vue';
import CuiTileReading from '../frame/CuiTileReading.vue';
import { useCameraName } from '../useCameraRecord.js';
import { useTileSensor } from '../useTileSensor.js';
import { useDetection } from './useDetection.js';

import type { SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online } = useTileSensor(props);
const { stateText } = useDetection(() => props.sensor);
const cameraName = useCameraName(props.sensor.boundCameraId);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const typeLabel = computed(() => t(`components.camera_options.sensor_type_${props.sensor.type}`));
</script>

<style scoped>
.helper-large__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 5rem;
  height: 5rem;
  border-radius: 50%;
  background: var(--p-content-hover-background);
  color: var(--text-secondary-color);
  font-size: 2.25rem;
}
</style>
