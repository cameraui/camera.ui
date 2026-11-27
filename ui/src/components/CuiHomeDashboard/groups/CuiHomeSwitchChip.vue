<template>
  <CuiHomeToggleChip
    :sensor
    :label="sensor.displayName.value"
    :on
    :color
    :tail
    :tail-label="inUse ? t('components.sensor_tile.in_use') : undefined"
    :disabled
    @toggle="toggle"
  />
</template>

<script setup lang="ts">
import InUseIcon from '~icons/mdi/lightning-bolt';

import { sensorIcon } from '@/common/sensorDisplay.js';
import { useLiveProperty } from '@/components/CuiSensorTile/useLiveProperty.js';

import CuiHomeToggleChip from './CuiHomeToggleChip.vue';
import { drawsPower, powerProperty } from './switches.js';

import type { CuiHomeSwitchChipProps } from './switches.js';

const props = defineProps<CuiHomeSwitchChipProps>();

const { t } = useI18n();

const power = useLiveProperty(() => props.sensor, powerProperty(props.sensor), false);

const on = computed(() => power.value.value === true);
const inUse = computed(() => on.value && drawsPower(props.sensor));
const tail = computed(() => {
  if (props.typed) return sensorIcon(props.sensor.type, props.sensor);
  return inUse.value ? InUseIcon : undefined;
});

function toggle() {
  power.commit(!on.value);
}
</script>
