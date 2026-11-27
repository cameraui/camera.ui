<template>
  <CuiTileWidget
    :icon
    :title="name"
    :state="stateText"
    :summary
    :color="lightColor"
    :active="lit"
    :offline="!online"
    :hero="hasBrightness && lit ? `${percent} %` : stateText"
    @open="emit('expand', $event)"
  >
    <template v-if="!disabled" #actions>
      <ToggleSwitch :model-value="on" :disabled="!interactive" :aria-label="t('components.sensor_tile.power')" @update:model-value="toggle" />
    </template>

    <template v-if="!disabled" #default="{ form }">
      <CuiLevelBar
        v-if="hasBrightness"
        :value="lit ? level : 0"
        :label="t('components.sensor_tile.brightness')"
        :color="lightColor"
        :disabled="!interactive"
        @input="inputLevel"
        @commit="commitLevel"
      />
      <CuiTileChoiceRow
        v-if="form === 'tall' && whites.length > 0"
        :options="whites"
        :selected="white"
        :interactive
        @select="(value) => commitTemperature(Number(value))"
      />
    </template>
  </CuiTileWidget>
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiLevelBar from '../frame/CuiLevelBar.vue';
import CuiTileChoiceRow from '../frame/CuiTileChoiceRow.vue';
import CuiTileWidget from '../frame/CuiTileWidget.vue';
import { useTileSensor } from '../useTileSensor.js';
import { useLight } from './useLight.js';
import { isWhite, whitesIn } from './whites.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const {
  on,
  lit,
  hasBrightness,
  hasTemperature,
  mode,
  temperatureRange,
  level,
  percent,
  temperature,
  lightColor,
  stateText,
  summary,
  toggle,
  inputLevel,
  commitLevel,
  commitTemperature,
} = useLight(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const kelvin = temperature.value;
const whites = computed(() =>
  hasTemperature.value ? whitesIn(temperatureRange.value).map((entry) => ({ value: String(entry.kelvin), label: t(`components.sensor_tile.${entry.name}`) })) : [],
);
const white = computed(() => {
  if (mode.value !== 'white') return undefined;
  return whitesIn(temperatureRange.value)
    .find((entry) => isWhite(entry, kelvin.value))
    ?.kelvin.toString();
});
</script>
