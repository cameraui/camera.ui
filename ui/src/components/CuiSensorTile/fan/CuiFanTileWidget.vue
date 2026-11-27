<template>
  <CuiTileWidget
    :icon
    :title="name"
    :state="stateText"
    :summary
    :color
    :active="lit"
    :offline="!online"
    :badge="childLock ? LockIcon : undefined"
    :badge-label="propertyLabel(AirPurifierProperty.ChildLock)"
    :hero="lit && hasSpeed ? speedHero : stateText"
    :hero-note="caption"
    @open="emit('expand', $event)"
  >
    <template v-if="!disabled" #actions>
      <ToggleSwitch :model-value="on" :disabled="!interactive" :aria-label="t('components.sensor_tile.power')" @update:model-value="toggle" />
    </template>

    <template v-if="!disabled" #default="{ form }">
      <CuiLevelBar
        v-if="hasSpeed"
        :value="lit ? ratio : 0"
        :label="speedText ?? ''"
        :aria-label="propertyLabel(FanProperty.Speed)"
        :color
        :disabled="!interactive"
        @input="inputLevel"
        @commit="commitLevel"
      />

      <template v-if="form === 'tall'">
        <CuiTileChoiceRow v-if="presets.length > 0" :options="presets" :selected="preset" :interactive @select="(value) => send(FanProperty.Preset, value)" />
        <div v-else-if="hasOscillation || hasDirection" class="fan-widget__row">
          <CuiTileAction
            v-if="hasOscillation"
            show-label
            :icon="OscillateIcon"
            :label="t('components.sensor_tile.oscillating')"
            :active="oscillating"
            :interactive
            @click="setOscillating(!oscillating)"
          />
          <CuiTileAction
            v-if="hasDirection"
            :icon="reverse ? ReverseIcon : ForwardIcon"
            :label="propertyLabel(FanProperty.Direction)"
            :interactive
            @click="setDirection(reverse ? FanDirection.Forward : FanDirection.Reverse)"
          />
        </div>
      </template>
    </template>
  </CuiTileWidget>
</template>

<script setup lang="ts">
import { AirPurifierProperty, FanDirection, FanProperty } from '@camera.ui/sdk';
import OscillateIcon from '~icons/mdi/arrow-oscillating';
import LockIcon from '~icons/mdi/lock';
import ReverseIcon from '~icons/mdi/rotate-left';
import ForwardIcon from '~icons/mdi/rotate-right';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiLevelBar from '../frame/CuiLevelBar.vue';
import CuiTileAction from '../frame/CuiTileAction.vue';
import CuiTileChoiceRow from '../frame/CuiTileChoiceRow.vue';
import CuiTileWidget from '../frame/CuiTileWidget.vue';
import { useTileSensor } from '../useTileSensor.js';
import { useFan } from './useFan.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const {
  on,
  lit,
  color,
  hasSpeed,
  ratio,
  steps,
  step,
  speedText,
  hasDirection,
  reverse,
  hasOscillation,
  oscillating,
  presets,
  preset,
  childLock,
  caption,
  stateText,
  toggle,
  inputLevel,
  commitLevel,
  setDirection,
  setOscillating,
  propertyLabel,
  send,
} = useFan(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const speedHero = computed(() => (steps.value > 0 ? `${step.value}/${steps.value}` : `${Math.round(ratio.value * 100)} %`));
const summary = computed(() => (props.disabled && lit.value && speedText.value ? `${stateText.value} · ${speedText.value}` : undefined));
</script>

<style scoped>
.fan-widget__row {
  display: flex;
  gap: 0.5rem;
}
</style>
