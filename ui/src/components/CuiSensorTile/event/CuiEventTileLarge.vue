<template>
  <CuiTilePanel :icon :title="name" :state="t(`components.camera_options.sensor_type_${sensor.type}`)" :color :active :offline="!online">
    <div class="flex flex-col items-center gap-4">
      <CuiTileControl v-if="runnable" :caption="t('components.scene_control.run')">
        <CuiTileButton :icon="RunIcon" :label="t('components.scene_control.run')" :color :active hero :interactive @click="run" />
      </CuiTileControl>
      <CuiBellScene v-else-if="sensor.type === SensorType.Doorbell" :ringing="active" :camera-id="sensor.boundCameraId" />
      <CuiPressScene v-else-if="sensor.type === SensorType.Button" :press="active ? String(last?.value) : undefined" :stamp="last?.timestamp" />
      <CuiAccessScene v-else :active :method="method" :granted="last ? last.value === AccessResult.Granted : undefined" />

      <CuiTileReading :state="stateText" />

      <CuiTileMoments :sensor :moments :loaded :describe />
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import { AccessProperty, AccessResult, SensorType } from '@camera.ui/sdk';
import RunIcon from '~icons/mdi/play';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileButton from '../frame/CuiTileButton.vue';
import CuiTileControl from '../frame/CuiTileControl.vue';
import CuiTileMoments from '../frame/CuiTileMoments.vue';
import CuiTilePanel from '../frame/CuiTilePanel.vue';
import CuiTileReading from '../frame/CuiTileReading.vue';
import { useTileSensor } from '../useTileSensor.js';
import CuiAccessScene from './CuiAccessScene.vue';
import CuiBellScene from './CuiBellScene.vue';
import CuiPressScene from './CuiPressScene.vue';
import { useEventSensor } from './useEventSensor.js';

import type { SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { runnable, moments, loaded, active, last, color, stateText, describe, run } = useEventSensor(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const method = computed(() => last.value?.details[AccessProperty.Method] as string | undefined);
</script>
