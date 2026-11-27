<template>
  <CuiTileWidget
    :icon
    :title="name"
    :state="hint ? t('components.sensor_tile.hold_to_open') : sinceText"
    :summary="hint ? t('components.sensor_tile.hold_to_open') : stateText"
    :color
    :active="isOpen"
    :offline="!online"
    :hero="hasPosition ? `${Math.round(position)} %` : stateText"
    :hero-note="hasPosition ? stateText : undefined"
    @open="emit('expand', $event)"
  >
    <template #default="{ form }">
      <template v-if="form === 'tall'">
        <CuiLevelBar
          v-if="hasPosition && !disabled"
          :value="ratio"
          :label="propertyLabel(ValveProperty.TargetPosition)"
          :color
          :disabled="!interactive || (gas && !isOpen)"
          @input="inputPosition"
          @commit="commitPosition"
        />
        <CuiTileChoiceRow
          v-else-if="hasDuration && !disabled"
          :options="durationOptions"
          :selected="String(duration.value.value)"
          :interactive
          @select="(value) => setDuration(Number(value))"
        />
        <CuiTileTimeline v-else bare :sensor :property="ValveProperty.CurrentState" :entries :now :color-of="timelineColor" />
      </template>

      <div v-if="!disabled" class="valve-widget__actions">
        <CuiTileHoldAction
          :icon="OpenIcon"
          :label="t('components.sensor_tile.open')"
          :show-label="!isOpen"
          :color
          :active="isOpen"
          :guarded="gas && !isOpen"
          :interactive
          @press="open"
          @hint="hint = $event"
        />
        <CuiTileAction :icon="CloseIcon" :label="t('components.sensor_tile.close')" :show-label="isOpen" :interactive @click="close" />
      </div>
    </template>
  </CuiTileWidget>
</template>

<script setup lang="ts">
import { ValveProperty } from '@camera.ui/sdk';
import CloseIcon from '~icons/mdi/valve-closed';
import OpenIcon from '~icons/mdi/valve-open';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiLevelBar from '../frame/CuiLevelBar.vue';
import CuiTileAction from '../frame/CuiTileAction.vue';
import CuiTileChoiceRow from '../frame/CuiTileChoiceRow.vue';
import CuiTileHoldAction from '../frame/CuiTileHoldAction.vue';
import CuiTileTimeline from '../frame/CuiTileTimeline.vue';
import CuiTileWidget from '../frame/CuiTileWidget.vue';
import { useSensorHistory } from '../useSensorHistory.js';
import { useSensorSettings } from '../useSensorSettings.js';
import { useTileSensor } from '../useTileSensor.js';
import { useValve } from './useValve.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { propertyLabel } = useSensorSettings(() => props.sensor);
const {
  gas,
  color,
  hasPosition,
  hasDuration,
  isOpen,
  position,
  ratio,
  duration,
  stateText,
  open,
  close,
  inputPosition,
  commitPosition,
  setDuration,
  durations,
  timelineColor,
} = useValve(() => props.sensor);
const { entries, now, sinceText } = useSensorHistory(
  () => props.sensor,
  () => ValveProperty.CurrentState,
);

const hint = ref(false);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const durationOptions = computed(() => durations.value.map(({ value, label }) => ({ value: String(value), label })));
</script>

<style scoped>
.valve-widget__actions {
  display: flex;
  gap: 0.5rem;
}
</style>
