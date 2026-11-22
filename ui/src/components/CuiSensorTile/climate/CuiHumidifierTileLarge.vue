<template>
  <CuiTilePanel :icon :title="name" :state="stateText" :color :active="on" :offline="!online">
    <template #actions>
      <CuiTileButton :icon="PowerIcon" :label="t('components.sensor_tile.power')" :color :active="on" :interactive @click="toggle" />
    </template>

    <div class="flex flex-col items-center gap-4">
      <CuiClimateDial
        :range
        :activity
        unit=" %"
        :current
        :target="on ? target.value.value : undefined"
        :value="on ? targetText : current === undefined ? '–' : percent(current)"
        :reading
        :disabled="!interactive"
        @input="(_knob, value) => setTarget(value, false)"
        @commit="(_knob, value) => setTarget(value, true)"
      >
        <template v-if="on" #bottom>
          <CuiTileButton :icon="MinusIcon" :label="t('components.sensor_tile.drier')" :interactive @click="setTarget(target.value.value - range.step, true)" />
          <CuiTileButton :icon="PlusIcon" :label="t('components.sensor_tile.moister')" :interactive @click="setTarget(target.value.value + range.step, true)" />
        </template>
      </CuiClimateDial>

      <div v-if="modes.length > 0 && names.mode" class="flex flex-col gap-1 w-full">
        <span class="text-xs font-medium text-muted">{{ propertyLabel(names.mode) }}</span>
        <SelectButton
          v-if="modes.length <= MAX_MODE_BUTTONS"
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
        <Select
          v-else
          :model-value="mode"
          :options="modes"
          option-label="label"
          option-value="value"
          size="small"
          fluid
          :disabled="!interactive"
          @update:model-value="setMode"
        />
      </div>

      <CuiMeasurementTrend v-if="names.current" :sensor :property="names.current" :format="percent" />
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import PowerIcon from '~icons/lucide/power';
import MinusIcon from '~icons/mdi/minus';
import PlusIcon from '~icons/mdi/plus';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileButton from '../frame/CuiTileButton.vue';
import CuiTilePanel from '../frame/CuiTilePanel.vue';
import CuiMeasurementTrend from '../measurement/CuiMeasurementTrend.vue';
import { useTileSensor } from '../useTileSensor.js';
import CuiClimateDial from './CuiClimateDial.vue';
import { useHumidifier } from './useHumidifier.js';

import type { SensorTileProps } from '../types.js';

const MAX_MODE_BUTTONS = 4;

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { names, on, activity, color, range, current, target, targetText, modes, mode, stateText, toggle, setTarget, setMode, percent, propertyLabel } = useHumidifier(
  () => props.sensor,
);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const reading = computed(() => {
  if (current.value === undefined) return undefined;
  return on.value ? t('components.sensor_tile.current_value', { value: percent(current.value) }) : t('components.sensor_tile.current');
});
</script>
