<template>
  <CuiTileWidget
    :icon
    :title="name"
    :state="sinceText"
    :summary="stateText"
    :color
    :active="on"
    :offline="!online"
    :hero="stateText"
    :hero-note="inUse ? t('components.sensor_tile.in_use') : undefined"
    @open="emit('expand', $event)"
  >
    <template v-if="!disabled" #actions>
      <ToggleSwitch :model-value="on" :disabled="!interactive" :aria-label="t('components.sensor_tile.power')" @update:model-value="setOn" />
    </template>

    <template #default="{ form }">
      <CuiTileTimeline v-if="form === 'tall'" bare :sensor :property :entries :now />
    </template>
  </CuiTileWidget>
</template>

<script setup lang="ts">
import { OutletProperty, SwitchProperty } from '@camera.ui/sdk';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileTimeline from '../frame/CuiTileTimeline.vue';
import CuiTileWidget from '../frame/CuiTileWidget.vue';
import { useSensorHistory } from '../useSensorHistory.js';
import { useTileSensor } from '../useTileSensor.js';
import { useSwitch } from './useSwitch.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { on, isOutlet, inUse, color, stateText, setOn } = useSwitch(() => props.sensor);
const property = computed(() => (isOutlet.value ? OutletProperty.On : SwitchProperty.On));
const { entries, now, sinceText } = useSensorHistory(
  () => props.sensor,
  () => property.value,
);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
</script>
