<template>
  <CuiTilePanel fit :icon :title="name" :state="stateText" :color :active="lit" :offline="!online">
    <template v-if="hasSpeed" #actions>
      <CuiTileButton :icon="PowerIcon" :label="t('components.sensor_tile.power')" :color :active="lit" :interactive @click="toggle" />
    </template>

    <div class="flex flex-col items-center gap-4">
      <CuiPurifierScene class="tile-art" v-if="isPurifier" :lit :working :ratio />
      <CuiFanScene class="tile-art" v-else :lit :ratio :reverse :oscillating />

      <template v-if="hasSpeed">
        <CuiTileReading v-if="disabled" :state="lit ? (speedText ?? '') : stateText" />
        <SelectButton
          v-else-if="steps > 0 && steps <= MAX_STEP_BUTTONS"
          :model-value="lit ? step : undefined"
          :options="stepOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          :disabled="!interactive"
          :aria-label="propertyLabel(FanProperty.Speed)"
          size="small"
          fluid
          @update:model-value="setStep"
        />
        <CuiLevelBar
          v-else
          class="w-full"
          :value="lit ? ratio : 0"
          :label="lit ? (speedText ?? '') : stateText"
          :aria-label="propertyLabel(FanProperty.Speed)"
          :color
          :disabled="!interactive"
          @input="inputLevel"
          @commit="commitLevel"
        />
      </template>
      <CuiTileButton v-else hero :icon="PowerIcon" :label="t('components.sensor_tile.power')" :color :active="lit" :interactive @click="toggle" />

      <div v-if="controls.length > 0" class="flex flex-wrap justify-center gap-4">
        <CuiTileControl v-for="control in controls" :key="control.key" :caption="control.caption">
          <CuiTileButton :icon="control.icon" :label="control.label" :color :active="control.active" :interactive @click="control.press" />
        </CuiTileControl>
      </div>

      <div v-if="presets.length > 0 && !disabled" class="flex flex-col gap-1 w-full">
        <span class="text-xs font-medium text-muted">{{ propertyLabel(FanProperty.Preset) }}</span>
        <Select
          :model-value="preset"
          :options="presets"
          option-label="label"
          option-value="value"
          size="small"
          fluid
          :disabled="!interactive"
          @update:model-value="(value) => send(FanProperty.Preset, value)"
        />
      </div>

      <div v-if="filterLife !== undefined" class="flex flex-col gap-1.5 w-full">
        <div class="flex items-center justify-between text-xs font-medium">
          <span class="text-muted">{{ propertyLabel(AirPurifierProperty.FilterLife) }}</span>
          <span :style="{ color: filterColor }">{{ changeFilter ? t('components.sensor_state.change_filter') : `${filterLife} %` }}</span>
        </div>
        <div class="fan-large__meter">
          <div class="fan-large__meter-fill" :style="{ width: `${Math.min(Math.max(filterLife, 0), 100)}%`, background: filterColor }" />
        </div>
      </div>

      <CuiTileHistoryTimeline :sensor :property="FanProperty.On" />
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import { AirPurifierProperty, FanDirection, FanProperty } from '@camera.ui/sdk';
import PowerIcon from '~icons/lucide/power';
import OscillateIcon from '~icons/mdi/arrow-oscillating';
import AutoIcon from '~icons/mdi/fan-auto';
import LockIcon from '~icons/mdi/lock';
import UnlockIcon from '~icons/mdi/lock-open-variant';
import ReverseIcon from '~icons/mdi/rotate-left';
import ForwardIcon from '~icons/mdi/rotate-right';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiLevelBar from '../frame/CuiLevelBar.vue';
import CuiTileButton from '../frame/CuiTileButton.vue';
import CuiTileControl from '../frame/CuiTileControl.vue';
import CuiTileHistoryTimeline from '../frame/CuiTileHistoryTimeline.vue';
import CuiTilePanel from '../frame/CuiTilePanel.vue';
import CuiTileReading from '../frame/CuiTileReading.vue';
import { useTileSensor } from '../useTileSensor.js';
import CuiFanScene from './CuiFanScene.vue';
import CuiPurifierScene from './CuiPurifierScene.vue';
import { useFan } from './useFan.js';

import type { SensorTileProps } from '../types.js';
import type { FanControl } from './types.js';

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const {
  lit,
  isPurifier,
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
  toggles,
  working,
  filterLife,
  changeFilter,
  filterColor,
  stateText,
  toggle,
  inputLevel,
  commitLevel,
  setStep,
  setDirection,
  setOscillating,
  propertyLabel,
  send,
} = useFan(() => props.sensor);

const MAX_STEP_BUTTONS = 6;

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const stepOptions = computed(() => Array.from({ length: steps.value }, (_, index) => ({ label: String(index + 1), value: index + 1 })));

const controls = computed(() => {
  const list: FanControl[] = [];
  if (hasOscillation.value) {
    const label = propertyLabel(FanProperty.Oscillating);
    list.push({ key: 'oscillating', icon: OscillateIcon, label, caption: label, active: oscillating.value, press: () => setOscillating(!oscillating.value) });
  }
  if (hasDirection.value) {
    const next = reverse.value ? FanDirection.Forward : FanDirection.Reverse;
    list.push({
      key: 'direction',
      icon: reverse.value ? ReverseIcon : ForwardIcon,
      label: propertyLabel(FanProperty.Direction),
      caption: t(`components.automation_nodes.${props.sensor.type}_state_${reverse.value ? FanDirection.Reverse : FanDirection.Forward}`),
      active: reverse.value,
      press: () => setDirection(next),
    });
  }
  for (const setting of toggles.value) {
    const locked = setting.property === AirPurifierProperty.ChildLock && setting.value;
    list.push({
      key: setting.property,
      icon: setting.property === AirPurifierProperty.ChildLock ? (locked ? LockIcon : UnlockIcon) : AutoIcon,
      label: setting.label,
      caption: setting.label,
      active: setting.value,
      press: () => send(setting.property, !setting.value),
    });
  }
  return list;
});
</script>

<style scoped>
.fan-large__meter {
  height: 0.375rem;
  border-radius: 999px;
  background: var(--p-content-hover-background);
  overflow: hidden;
}

.fan-large__meter-fill {
  height: 100%;
  border-radius: inherit;
  transition:
    width 0.3s ease,
    background 0.3s ease;
}
</style>
