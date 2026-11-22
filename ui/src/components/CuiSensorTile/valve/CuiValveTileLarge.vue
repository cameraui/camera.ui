<template>
  <CuiTilePanel :icon :title="name" :state="t(`components.camera_options.sensor_type_${sensor.type}`)" :color :active="isOpen" :offline="!online">
    <div class="flex flex-col items-center gap-4">
      <CuiValveScene :ratio :flowing="isOpen" />

      <CuiTileReading :state="stateText" :detail="sinceText" />

      <div class="flex flex-wrap justify-center gap-4">
        <CuiTileControl :caption="t('components.sensor_tile.open')">
          <CuiHoldButton
            :icon="OpenIcon"
            :label="t('components.sensor_tile.open')"
            :color
            :active="isOpen"
            :guarded="gas && !isOpen"
            :interactive
            @press="open"
            @hint="hint = $event"
          />
        </CuiTileControl>
        <CuiTileControl :caption="t('components.sensor_tile.close')">
          <CuiTileButton :icon="CloseIcon" :label="t('components.sensor_tile.close')" :interactive @click="close" />
        </CuiTileControl>
      </div>
      <span v-if="hint" class="text-xs text-muted">{{ t('components.sensor_tile.hold_to_open') }}</span>

      <div v-if="hasPosition" class="flex flex-col gap-2 w-full">
        <span class="text-xs font-medium text-muted">{{ propertyLabel(ValveProperty.TargetPosition) }}</span>
        <CuiLevelBar
          :value="ratio"
          :label="`${Math.round(position)} %`"
          :aria-label="propertyLabel(ValveProperty.TargetPosition)"
          :color
          :disabled="!interactive || (gas && !isOpen)"
          @input="inputPosition"
          @commit="commitPosition"
        />
      </div>

      <div v-if="hasDuration" class="flex flex-col gap-1 w-full">
        <span class="text-xs font-medium text-muted">{{ propertyLabel(ValveProperty.Duration) }}</span>
        <SelectButton
          :model-value="duration.value.value"
          :options="durations"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          :disabled="!interactive"
          size="small"
          fluid
          @update:model-value="setDuration"
        />
      </div>

      <CuiTileTimeline :sensor :property="ValveProperty.CurrentState" :entries :now :color-of="timelineColor" />
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import { ValveProperty, ValveState } from '@camera.ui/sdk';
import CloseIcon from '~icons/mdi/valve-closed';
import OpenIcon from '~icons/mdi/valve-open';

import { sensorIcon, sensorPropertySpec } from '@/common/sensorDisplay.js';

import CuiHoldButton from '../frame/CuiHoldButton.vue';
import CuiLevelBar from '../frame/CuiLevelBar.vue';
import CuiTileButton from '../frame/CuiTileButton.vue';
import CuiTileControl from '../frame/CuiTileControl.vue';
import CuiTilePanel from '../frame/CuiTilePanel.vue';
import CuiTileReading from '../frame/CuiTileReading.vue';
import CuiTileTimeline from '../frame/CuiTileTimeline.vue';
import { useSensorHistory } from '../useSensorHistory.js';
import { useSensorSettings } from '../useSensorSettings.js';
import { useTileSensor } from '../useTileSensor.js';
import CuiValveScene from './CuiValveScene.vue';
import { useValve } from './useValve.js';

import type { SensorTileProps } from '../types.js';

const DURATION_MINUTES = [5, 10, 15, 30, 60];

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { propertyLabel } = useSensorSettings(() => props.sensor);
const { gas, color, hasPosition, hasDuration, isOpen, position, ratio, duration, stateText, open, close, inputPosition, commitPosition, setDuration } = useValve(
  () => props.sensor,
);
const { entries, now, sinceText } = useSensorHistory(
  () => props.sensor,
  () => ValveProperty.CurrentState,
);

const hint = ref(false);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const durations = computed(() => {
  const max = sensorPropertySpec(props.sensor, ValveProperty.Duration)?.max ?? Infinity;
  const seconds = new Set(DURATION_MINUTES.map((minutes) => minutes * 60).filter((value) => value <= max));
  if (duration.value.value > 0) seconds.add(duration.value.value);
  return [...seconds].sort((a, b) => a - b).map((value) => ({ value, label: t('components.sensor_tile.minutes', { count: Math.round(value / 60) }) }));
});

function timelineColor(value: unknown): string | undefined {
  return value === ValveState.Open || value === ValveState.Opening ? color.value : undefined;
}
</script>
