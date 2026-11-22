<template>
  <CuiTilePanel :icon :title="name" :state="summary" :color="lightColor" :active="lit" :offline="!online">
    <template v-if="hasBrightness" #actions>
      <CuiTileButton :icon="PowerIcon" :label="t('components.sensor_tile.power')" :color="lightColor" :active="lit" :interactive @click="toggle" />
    </template>

    <CuiLevelBar
      v-if="hasBrightness"
      :value="lit ? level : 0"
      :label="lit ? `${percent} %` : stateText"
      :aria-label="t('components.sensor_tile.brightness')"
      :color="lightColor"
      :disabled="!interactive"
      @input="inputLevel"
      @commit="commitLevel"
    />

    <div v-else class="flex justify-center py-3">
      <CuiTileButton hero :icon="PowerIcon" :label="t('components.sensor_tile.power')" :color="lightColor" :active="lit" :interactive @click="toggle" />
    </div>

    <SelectButton
      v-if="hasTemperature && hasColor"
      :model-value="mode"
      :options="modes"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      :disabled="!interactive"
      size="small"
      fluid
      @update:model-value="setMode"
    />

    <CuiLightTemperature
      v-if="hasTemperature && (!hasColor || mode === 'white')"
      :kelvin
      :range="temperatureRange"
      :disabled="!interactive"
      @input="inputTemperature"
      @commit="commitTemperature"
    />

    <CuiLightColorWheel
      v-if="hasColor && (!hasTemperature || mode === 'color')"
      :color="hueSaturation"
      :disabled="!interactive"
      @input="inputColor"
      @commit="commitColor"
    />
  </CuiTilePanel>
</template>

<script setup lang="ts">
import PowerIcon from '~icons/lucide/power';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiLevelBar from '../frame/CuiLevelBar.vue';
import CuiTileButton from '../frame/CuiTileButton.vue';
import CuiTilePanel from '../frame/CuiTilePanel.vue';
import { useTileSensor } from '../useTileSensor.js';
import CuiLightColorWheel from './CuiLightColorWheel.vue';
import CuiLightTemperature from './CuiLightTemperature.vue';
import { useLight } from './useLight.js';

import type { SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const {
  lit,
  hasBrightness,
  hasTemperature,
  hasColor,
  mode,
  temperatureRange,
  level,
  percent,
  temperature,
  color,
  lightColor,
  stateText,
  summary,
  toggle,
  inputLevel,
  commitLevel,
  inputTemperature,
  commitTemperature,
  inputColor,
  commitColor,
  setMode,
} = useLight(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const kelvin = temperature.value;
const hueSaturation = color.value;
const modes = computed(() => [
  { label: t('components.sensor_tile.white'), value: 'white' },
  { label: t('components.sensor_tile.color'), value: 'color' },
]);
</script>
