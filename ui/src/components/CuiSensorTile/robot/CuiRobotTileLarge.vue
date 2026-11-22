<template>
  <CuiTilePanel :icon :title="name" :state="t(`components.camera_options.sensor_type_${sensor.type}`)" :color :active="busy || error" :offline="!online">
    <div class="flex flex-col items-center gap-4">
      <CuiRobotScene :phase :lawn />

      <CuiTileReading :state="stateText" :detail="sinceText" />

      <CuiTileButton
        v-if="main"
        :icon="main === VacuumCommand.Pause ? PauseIcon : PlayIcon"
        :label="commandLabel(main)"
        :color
        hero
        :active="busy"
        :interactive
        @click="command(main)"
      />

      <div v-if="extras.length > 0" class="flex flex-wrap justify-center gap-2">
        <CuiTileControl v-for="extra in extras" :key="extra.command" :caption="commandLabel(extra.command)">
          <CuiTileButton :icon="extra.icon" :label="commandLabel(extra.command)" :color :interactive @click="command(extra.command)" />
        </CuiTileControl>
      </div>

      <div v-if="fanSpeeds.length > 0 && fanSpeedProperty" class="flex flex-col gap-1 w-full">
        <span class="text-xs font-medium text-muted">{{ propertyLabel(fanSpeedProperty) }}</span>
        <SelectButton
          v-if="fanSpeeds.length <= MAX_SPEED_BUTTONS"
          :model-value="fanSpeed"
          :options="fanSpeeds"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          :disabled="!interactive"
          size="small"
          fluid
          @update:model-value="setFanSpeed"
        />
        <Select
          v-else
          :model-value="fanSpeed"
          :options="fanSpeeds"
          option-label="label"
          option-value="value"
          size="small"
          fluid
          :disabled="!interactive"
          @update:model-value="setFanSpeed"
        />
      </div>

      <CuiTileTimeline :sensor :property="activityProperty" :entries :now :color-of="timelineColor" />
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import { VacuumCommand } from '@camera.ui/sdk';
import DockIcon from '~icons/mdi/home-import-outline';
import LocateIcon from '~icons/mdi/map-marker-radius-outline';
import PauseIcon from '~icons/mdi/pause';
import PlayIcon from '~icons/mdi/play';
import StopIcon from '~icons/mdi/stop';
import SpotIcon from '~icons/mdi/target';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileButton from '../frame/CuiTileButton.vue';
import CuiTileControl from '../frame/CuiTileControl.vue';
import CuiTilePanel from '../frame/CuiTilePanel.vue';
import CuiTileReading from '../frame/CuiTileReading.vue';
import CuiTileTimeline from '../frame/CuiTileTimeline.vue';
import { useSensorHistory } from '../useSensorHistory.js';
import { useTileSensor } from '../useTileSensor.js';
import CuiRobotScene from './CuiRobotScene.vue';
import { useRobot } from './useRobot.js';

import type { Component } from 'vue';
import type { SensorTileProps } from '../types.js';

const MAX_SPEED_BUTTONS = 4;
const EXTRA_COMMANDS: [string, Component][] = [
  [VacuumCommand.Stop, StopIcon],
  [VacuumCommand.Dock, DockIcon],
  [VacuumCommand.Locate, LocateIcon],
  [VacuumCommand.Spot, SpotIcon],
];

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const {
  lawn,
  activityProperty,
  phase,
  busy,
  error,
  color,
  commands,
  fanSpeedProperty,
  fanSpeeds,
  fanSpeed,
  stateText,
  command,
  setFanSpeed,
  commandLabel,
  propertyLabel,
  timelineColor,
} = useRobot(() => props.sensor);
const { entries, now, sinceText } = useSensorHistory(
  () => props.sensor,
  () => activityProperty,
);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const main = computed(() => {
  if (busy.value && commands.value.includes(VacuumCommand.Pause)) return VacuumCommand.Pause;
  return commands.value.includes(VacuumCommand.Start) ? VacuumCommand.Start : undefined;
});
const extras = computed(() => EXTRA_COMMANDS.filter(([extra]) => commands.value.includes(extra)).map(([extra, extraIcon]) => ({ command: extra, icon: extraIcon })));
</script>
