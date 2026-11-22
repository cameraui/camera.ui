<template>
  <CuiTileCard
    :icon
    :title="name"
    :state="stateText"
    :color
    :active
    :fill="active ? 1 : 0"
    :offline="!online"
    :compact="size === 'small'"
    role="switch"
    :aria-checked="active"
    :aria-label="name"
    :tabindex="interactive ? 0 : -1"
    @click="interactive && toggle()"
    @keydown="interactive && onToggleKey($event, toggle)"
  >
    <template #corner>
      <CuiTileCornerButton :label="t('components.sensor_tile.controls')" @click.stop="emit('expand', $event)">
        <TuneIcon />
      </CuiTileCornerButton>
    </template>
  </CuiTileCard>
</template>

<script setup lang="ts">
import TuneIcon from '~icons/mdi/tune-variant';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileCard from '../frame/CuiTileCard.vue';
import CuiTileCornerButton from '../frame/CuiTileCornerButton.vue';
import { onToggleKey } from '../keys.js';
import { useTileSensor } from '../useTileSensor.js';
import { useChime } from './useChime.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { active, color, stateText, toggle } = useChime(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
</script>
