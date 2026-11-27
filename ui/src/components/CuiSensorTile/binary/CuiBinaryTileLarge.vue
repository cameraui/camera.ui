<template>
  <CuiTilePanel fit :icon :title="name" :state="headline" :color :active :offline="!online">
    <div class="flex flex-col items-center gap-4">
      <CuiAlarmScene class="tile-art" v-if="group === 'alarm'" :icon :active />
      <CuiLeakScene class="tile-art" v-else-if="group === 'leak'" :active />
      <CuiGarageScene class="tile-art" v-else-if="kind === ContactKind.GarageDoor" :open-ratio="active ? 1 : 0" />
      <CuiContactScene class="tile-art" v-else-if="group === 'contact'" :open="active" :window="kind === ContactKind.Window" />
      <CuiPresenceScene class="tile-art" v-else-if="group === 'presence'" :active />
      <CuiPowerScene class="tile-art" v-else-if="group === 'power'" :active />
      <CuiVibrationScene class="tile-art" v-else :active />

      <CuiTileReading :state="stateText" :detail="sinceText ?? ''" />

      <CuiTileTimeline :sensor :property :entries :now />
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import { ContactKind } from '@camera.ui/sdk';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiGarageScene from '../cover/CuiGarageScene.vue';
import CuiTilePanel from '../frame/CuiTilePanel.vue';
import CuiTileReading from '../frame/CuiTileReading.vue';
import CuiTileTimeline from '../frame/CuiTileTimeline.vue';
import { useSensorHistory } from '../useSensorHistory.js';
import { useTileSensor } from '../useTileSensor.js';
import CuiAlarmScene from './CuiAlarmScene.vue';
import CuiContactScene from './CuiContactScene.vue';
import CuiLeakScene from './CuiLeakScene.vue';
import CuiPowerScene from './CuiPowerScene.vue';
import CuiPresenceScene from './CuiPresenceScene.vue';
import CuiVibrationScene from './CuiVibrationScene.vue';
import { useBinary } from './useBinary.js';

import type { SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();

const { name, online } = useTileSensor(props);
const { property, group, active, color, kind, stateText, headline } = useBinary(() => props.sensor);
const { entries, now, sinceText } = useSensorHistory(
  () => props.sensor,
  () => property,
);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
</script>
