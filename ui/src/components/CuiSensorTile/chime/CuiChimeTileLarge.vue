<template>
  <CuiTilePanel fit :icon :title="name" :state="t(`components.camera_options.sensor_type_${sensor.type}`)" :color :active :offline="!online">
    <div class="flex flex-col items-center gap-4">
      <CuiBellScene class="tile-art" :ringing="active" />

      <CuiTileReading :state="stateText" />

      <CuiTileControl v-if="!disabled" :caption="playLabel">
        <CuiTileButton :icon="active ? StopIcon : PlayIcon" :label="playLabel" :color :active hero :interactive @click="toggle" />
      </CuiTileControl>

      <div v-if="tones.length > 0 && !disabled" class="flex flex-col gap-1 w-full">
        <span class="text-xs font-medium text-muted">{{ propertyLabel(ChimeProperty.Tone) }}</span>
        <SelectButton
          v-if="tones.length <= MAX_TONE_BUTTONS"
          :model-value="tone"
          :options="tones"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          :disabled="!interactive"
          size="small"
          fluid
          @update:model-value="setTone"
        />
        <Select
          v-else
          :model-value="tone"
          :options="tones"
          option-label="label"
          option-value="value"
          size="small"
          fluid
          :disabled="!interactive"
          @update:model-value="setTone"
        />
      </div>

      <div v-if="hasVolume" class="flex flex-col gap-2 w-full">
        <span class="text-xs font-medium text-muted">{{ propertyLabel(ChimeProperty.Volume) }}</span>
        <CuiLevelBar
          v-if="!disabled"
          :value="ratio"
          :label="`${percent} %`"
          :aria-label="propertyLabel(ChimeProperty.Volume)"
          :color
          :disabled="!interactive"
          @input="inputVolume"
          @commit="commitVolume"
        />
        <span v-else class="text-sm font-semibold tabular-nums">{{ percent }} %</span>
      </div>

      <div v-if="hasRepeat" class="flex items-center justify-between gap-3 w-full">
        <span class="text-xs font-medium text-muted">{{ propertyLabel(ChimeProperty.Repeat) }}</span>
        <CuiNumberStepper
          v-if="!disabled"
          :model-value="repeat.value.value"
          :min="repeatRange.min"
          :max="repeatRange.max"
          :step="1"
          size="small"
          :disabled="!interactive"
          @update:model-value="(value: number | null) => value && setRepeat(value)"
        />
        <span v-else class="text-sm font-semibold tabular-nums">{{ repeat.value.value }}</span>
      </div>

      <CuiTileMoments :sensor :moments :loaded :describe />
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import { ChimeProperty } from '@camera.ui/sdk';
import PlayIcon from '~icons/mdi/play';
import StopIcon from '~icons/mdi/stop';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiBellScene from '../event/CuiBellScene.vue';
import CuiLevelBar from '../frame/CuiLevelBar.vue';
import CuiTileButton from '../frame/CuiTileButton.vue';
import CuiTileControl from '../frame/CuiTileControl.vue';
import CuiTileMoments from '../frame/CuiTileMoments.vue';
import CuiTilePanel from '../frame/CuiTilePanel.vue';
import CuiTileReading from '../frame/CuiTileReading.vue';
import { useSensorMoments } from '../useSensorMoments.js';
import { useTileSensor } from '../useTileSensor.js';
import { useChime } from './useChime.js';

import type { TileMomentRow } from '../frame/types.js';
import type { SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const {
  active,
  color,
  tones,
  tone,
  hasVolume,
  ratio,
  percent,
  hasRepeat,
  repeat,
  repeatRange,
  stateText,
  toggle,
  setTone,
  setRepeat,
  inputVolume,
  commitVolume,
  propertyLabel,
} = useChime(() => props.sensor);
const { moments, loaded } = useSensorMoments(() => props.sensor, [ChimeProperty.Active]);

const MAX_TONE_BUTTONS = 3;

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const playLabel = computed(() => t(`components.sensor_tile.${active.value ? 'stop' : 'play'}`));

function describe(): TileMomentRow {
  return { label: t('components.sensor_tile.rang') };
}
</script>
