<template>
  <CuiTilePanel :icon :title="name" :state="stateText" :color :active="on" :offline="!online">
    <div class="switch-stage">
      <CuiRockerSwitch :on :label="name" :color :disabled="!interactive" @change="setOn" />

      <template v-if="isOutlet">
        <CuiFlowLine :flowing="inUse" class="switch-stage__flow" />
        <CuiOutletSocket :on :in-use="inUse" :color />
      </template>
    </div>

    <CuiTileHistoryTimeline :sensor :property="SwitchProperty.On" />
  </CuiTilePanel>
</template>

<script setup lang="ts">
import { SwitchProperty } from '@camera.ui/sdk';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiFlowLine from '../frame/CuiFlowLine.vue';
import CuiTileHistoryTimeline from '../frame/CuiTileHistoryTimeline.vue';
import CuiTilePanel from '../frame/CuiTilePanel.vue';
import { useTileSensor } from '../useTileSensor.js';
import CuiOutletSocket from './CuiOutletSocket.vue';
import CuiRockerSwitch from './CuiRockerSwitch.vue';
import { useSwitch } from './useSwitch.js';

import type { SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();

const { name, online, interactive } = useTileSensor(props);
const { on, isOutlet, inUse, color, stateText, setOn } = useSwitch(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
</script>

<style scoped>
.switch-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0.5rem 0;
}

.switch-stage__flow {
  flex: 1;
  max-width: 5rem;
  min-width: 2rem;
}
</style>
