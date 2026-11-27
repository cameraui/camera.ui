<template>
  <CuiTileWidget
    :icon
    :title="name"
    :state="typeLabel"
    :summary="stateText"
    :color
    :active="busy || error"
    :offline="!online"
    :hero="stateText"
    @open="emit('expand', $event)"
  >
    <template v-if="!disabled" #default="{ form }">
      <CuiTileChoiceRow v-if="form === 'tall' && fanSpeeds.length > 1" :options="fanSpeeds" :selected="fanSpeed" :interactive @select="setFanSpeed" />
      <div v-if="main || canDock" class="robot-widget__actions">
        <CuiTileAction
          v-if="main"
          show-label
          :icon="main === VacuumCommand.Pause ? PauseIcon : PlayIcon"
          :label="commandLabel(main)"
          :color
          :active="busy"
          :interactive
          @click="command(main)"
        />
        <CuiTileAction v-if="canDock" :icon="DockIcon" :label="commandLabel(VacuumCommand.Dock)" :interactive @click="command(VacuumCommand.Dock)" />
      </div>
    </template>
  </CuiTileWidget>
</template>

<script setup lang="ts">
import { VacuumCommand } from '@camera.ui/sdk';
import DockIcon from '~icons/mdi/home-import-outline';
import PauseIcon from '~icons/mdi/pause';
import PlayIcon from '~icons/mdi/play';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileAction from '../frame/CuiTileAction.vue';
import CuiTileChoiceRow from '../frame/CuiTileChoiceRow.vue';
import CuiTileWidget from '../frame/CuiTileWidget.vue';
import { useTileSensor } from '../useTileSensor.js';
import { mainCommand, useRobot } from './useRobot.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { busy, error, color, commands, fanSpeeds, fanSpeed, stateText, command, setFanSpeed, commandLabel } = useRobot(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const typeLabel = computed(() => t(`components.camera_options.sensor_type_${props.sensor.type}`));
const main = computed(() => mainCommand(commands.value, busy.value));
const canDock = computed(() => commands.value.includes(VacuumCommand.Dock));
</script>

<style scoped>
.robot-widget__actions {
  display: flex;
  gap: 0.5rem;
}
</style>
