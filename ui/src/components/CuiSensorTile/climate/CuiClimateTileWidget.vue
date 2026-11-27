<template>
  <CuiTileWidget
    :icon
    :title="name"
    :state="reading"
    :summary="stateText"
    :color
    :active="!isOff"
    :offline="!online"
    :hero="centerValue"
    :hero-note="isOff ? undefined : t('components.sensor_tile.target')"
    extra-shows-hero
    @open="emit('expand', $event)"
  >
    <template #extra>
      <div class="climate-widget__dial">
        <CuiClimateDial
          :range="temperatureRange"
          :activity
          :current
          :target="isOff || hasRange ? undefined : targets.target"
          :low="hasRange ? targets.low : undefined"
          :high="hasRange ? targets.high : undefined"
          :value="centerValue"
          :reading="isOff ? undefined : t('components.sensor_tile.target')"
          :disabled="!interactive"
          still
          @input="(knob, value) => setTarget(knob, value, false)"
          @commit="(knob, value) => setTarget(knob, value, true)"
        />
      </div>
    </template>

    <CuiTileStepRow
      v-if="!isOff && !disabled"
      :down-label="t('components.sensor_tile.colder')"
      :up-label="t('components.sensor_tile.warmer')"
      :interactive
      @step="(direction) => nudge(targets, direction * temperatureRange.step, true)"
    >
      <CuiTileAction show-label :label="modeText" :interactive="cycles ? interactive : online" @click="cycleMode" />
    </CuiTileStepRow>
    <CuiTileAction v-else-if="!disabled" show-label :label="modeText" :interactive="cycles ? interactive : online" @click="cycleMode" />
  </CuiTileWidget>
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileAction from '../frame/CuiTileAction.vue';
import CuiTileStepRow from '../frame/CuiTileStepRow.vue';
import CuiTileWidget from '../frame/CuiTileWidget.vue';
import { useTileSensor } from '../useTileSensor.js';
import CuiClimateDial from './CuiClimateDial.vue';
import { nextMode } from './modes.js';
import { useClimate } from './useClimate.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { mode, modes, isOff, hasRange, activity, color, temperatureRange, current, targets, stateText, nudge, setTarget, setMode, modeLabel, degrees } = useClimate(
  () => props.sensor,
);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const modeText = computed(() => (!isOff.value && mode.value ? modeLabel(mode.value) : stateText.value));
const reading = computed(() => {
  if (current.value === undefined) return stateText.value;
  const now = t('components.sensor_tile.current_value', { value: degrees(current.value) });
  return props.disabled ? `${now} · ${modeText.value}` : now;
});
const cycles = computed(() => modes.value.length > 1);
const centerValue = computed(() => {
  const step = temperatureRange.value.step;
  if (hasRange.value) return `${degrees(targets.value.low, step)}–${degrees(targets.value.high, step)}`;
  if (!isOff.value) return degrees(targets.value.target, step);
  return current.value === undefined ? '–' : degrees(current.value);
});

function cycleMode(event: MouseEvent) {
  const next = nextMode(modes.value, mode.value);
  if (next) setMode(next);
  else emit('expand', event);
}
</script>

<style scoped>
.climate-widget__dial {
  height: 100%;
  aspect-ratio: 1;
  max-width: 100%;
}

.climate-widget__dial :deep(.climate-dial) {
  width: 100%;
}
</style>
