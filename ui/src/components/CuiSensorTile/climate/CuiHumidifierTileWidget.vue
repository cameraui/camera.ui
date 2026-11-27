<template>
  <CuiTileWidget
    :icon
    :title="name"
    :state="reading"
    :summary="stateText"
    :color
    :active="on"
    :offline="!online"
    :hero="on ? targetText : currentText"
    extra-shows-hero
    @open="emit('expand', $event)"
  >
    <template v-if="!disabled" #actions>
      <ToggleSwitch :model-value="on" :disabled="!interactive" :aria-label="t('components.sensor_tile.power')" @update:model-value="toggle" />
    </template>

    <template #extra>
      <div class="humidifier-widget__dial">
        <CuiClimateDial
          :range
          :activity
          unit=" %"
          :current
          :target="on ? target.value.value : undefined"
          :value="on ? targetText : currentText"
          :reading="on ? t('components.sensor_tile.target') : undefined"
          :disabled="!interactive"
          still
          @input="(_knob, value) => setTarget(value, false)"
          @commit="(_knob, value) => setTarget(value, true)"
        />
      </div>
    </template>

    <CuiTileStepRow
      v-if="on && !disabled"
      :down-label="t('components.sensor_tile.drier')"
      :up-label="t('components.sensor_tile.moister')"
      :interactive
      @step="(direction) => setTarget(target.value.value + direction * range.step, true)"
    >
      <CuiTileAction show-label :label="modeText" :interactive="modes.length > 1 ? interactive : online" @click="cycleMode" />
    </CuiTileStepRow>
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
import { useHumidifier } from './useHumidifier.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { on, activity, color, range, current, target, targetText, modes, mode, stateText, toggle, setTarget, setMode, percent } = useHumidifier(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const currentText = computed(() => (current.value === undefined ? '–' : percent(current.value)));
const modeText = computed(() => modes.value.find((option) => option.value === mode.value)?.label ?? stateText.value);
const reading = computed(() => {
  if (current.value === undefined) return stateText.value;
  const now = t('components.sensor_tile.current_value', { value: currentText.value });
  return props.disabled ? `${now} · ${on.value ? modeText.value : stateText.value}` : now;
});

function cycleMode(event: MouseEvent) {
  const next = nextMode(
    modes.value.map((option) => option.value),
    mode.value,
  );
  if (next) setMode(next);
  else emit('expand', event);
}
</script>

<style scoped>
.humidifier-widget__dial {
  height: 100%;
  aspect-ratio: 1;
  max-width: 100%;
}

.humidifier-widget__dial :deep(.climate-dial) {
  width: 100%;
}
</style>
