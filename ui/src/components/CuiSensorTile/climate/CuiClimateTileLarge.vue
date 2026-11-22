<template>
  <CuiTilePanel :icon :title="name" :state="stateText" :color :active="!isOff" :offline="!online">
    <div class="flex flex-col items-center gap-4">
      <CuiClimateDial
        :range="temperatureRange"
        :activity
        :current
        :target="isOff || hasRange ? undefined : targets.target"
        :low="hasRange ? targets.low : undefined"
        :high="hasRange ? targets.high : undefined"
        :value="centerValue"
        :reading
        :disabled="!interactive"
        @input="(knob, value) => setTarget(knob, value, false)"
        @commit="(knob, value) => setTarget(knob, value, true)"
      >
        <template v-if="hasRange">
          <span class="climate-large__range" :style="{ color: coolColor }">{{ degrees(targets.low, temperatureRange.step) }}</span>
          <span class="climate-large__range" :style="{ color: heatColor }">{{ degrees(targets.high, temperatureRange.step) }}</span>
        </template>

        <template v-if="!isOff" #bottom>
          <CuiTileButton :icon="MinusIcon" :label="t('components.sensor_tile.colder')" :interactive @click="nudge(targets, -temperatureRange.step, true)" />
          <CuiTileButton :icon="PlusIcon" :label="t('components.sensor_tile.warmer')" :interactive @click="nudge(targets, temperatureRange.step, true)" />
        </template>
      </CuiClimateDial>

      <div v-if="modes.length > 1" class="flex flex-col items-center gap-2">
        <div class="flex flex-wrap justify-center gap-3">
          <CuiTileButton
            v-for="value in modes"
            :key="value"
            :icon="modeIcon(value)"
            :label="modeLabel(value)"
            :color="modeColor(value)"
            :active="mode === value"
            :interactive
            @click="setMode(value)"
          />
        </div>
        <span v-if="mode" class="text-xs text-muted">{{ modeLabel(mode) }}</span>
      </div>

      <div v-if="presets.length > 0 || fanModes.length > 0" class="climate-large__choices">
        <div v-if="presets.length > 0" class="flex flex-col gap-1">
          <span class="text-xs font-medium text-muted">{{ propertyLabel(ThermostatProperty.Preset) }}</span>
          <Select
            :model-value="preset"
            :options="presets"
            option-label="label"
            option-value="value"
            size="small"
            fluid
            :disabled="!interactive"
            @update:model-value="(value) => send(ThermostatProperty.Preset, value)"
          />
        </div>
        <div v-if="fanModes.length > 0" class="flex flex-col gap-1">
          <span class="text-xs font-medium text-muted">{{ propertyLabel(ThermostatProperty.FanMode) }}</span>
          <Select
            :model-value="fanMode"
            :options="fanModes"
            option-label="label"
            option-value="value"
            size="small"
            fluid
            :disabled="!interactive"
            @update:model-value="(value) => send(ThermostatProperty.FanMode, value)"
          />
        </div>
      </div>

      <div v-if="targetHumidity !== undefined" class="flex flex-col gap-2 w-full">
        <span class="text-xs font-medium text-muted">{{ propertyLabel(ThermostatProperty.TargetHumidity) }}</span>
        <CuiLevelBar
          :value="toRatio(targetHumidity, humidityRange)"
          :label="`${targetHumidity} %`"
          :aria-label="propertyLabel(ThermostatProperty.TargetHumidity)"
          :color="toneColor('info')"
          :disabled="!interactive"
          @input="(ratio) => setTargetHumidity(fromRatio(ratio, humidityRange), false)"
          @commit="(ratio) => setTargetHumidity(fromRatio(ratio, humidityRange), true)"
        />
      </div>

      <div v-if="toggles.length > 0" class="flex flex-col gap-2 w-full">
        <CuiToggleRow v-for="toggle in toggles" :key="toggle.property" :label="toggle.label">
          <ToggleSwitch :model-value="toggle.value" :disabled="!interactive" @update:model-value="(value) => send(toggle.property, value)" />
        </CuiToggleRow>
      </div>
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import { ThermostatProperty } from '@camera.ui/sdk';
import MinusIcon from '~icons/mdi/minus';
import PlusIcon from '~icons/mdi/plus';

import { sensorIcon, toneColor } from '@/common/sensorDisplay.js';

import CuiLevelBar from '../frame/CuiLevelBar.vue';
import CuiTileButton from '../frame/CuiTileButton.vue';
import CuiTilePanel from '../frame/CuiTilePanel.vue';
import { fromRatio, toRatio } from '../range.js';
import { useTileSensor } from '../useTileSensor.js';
import CuiClimateDial from './CuiClimateDial.vue';
import { modeColor, modeIcon } from './modes.js';
import { useClimate } from './useClimate.js';

import type { SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const {
  mode,
  modes,
  isOff,
  hasRange,
  activity,
  color,
  temperatureRange,
  humidityRange,
  current,
  humidity,
  targets,
  targetHumidity,
  presets,
  preset,
  fanModes,
  fanMode,
  toggles,
  stateText,
  nudge,
  setTarget,
  setTargetHumidity,
  setMode,
  send,
  modeLabel,
  propertyLabel,
  degrees,
} = useClimate(() => props.sensor);

const heatColor = toneColor('warn');
const coolColor = toneColor('info');

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const centerValue = computed(() => {
  if (!isOff.value) return degrees(targets.value.target, temperatureRange.value.step);
  return current.value === undefined ? '–' : degrees(current.value);
});
const reading = computed(() => {
  const parts = [
    isOff.value ? t('components.sensor_tile.current') : current.value !== undefined && t('components.sensor_tile.current_value', { value: degrees(current.value) }),
  ];
  if (humidity.value !== undefined) parts.push(t('components.sensor_tile.humidity_value', { value: `${Math.round(humidity.value)} %` }));
  return parts.filter(Boolean).join(' · ');
});
</script>

<style scoped>
.climate-large__range {
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.climate-large__choices {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: 0.75rem;
  width: 100%;
}
</style>
