<template>
  <CuiTileCard
    :icon
    :title="name"
    :state="stateText"
    :color
    :active="!!shown"
    :offline="!online"
    :compact="size === 'small'"
    role="switch"
    :aria-checked="!!shown"
    :aria-label="name"
    :tabindex="interactive ? 0 : -1"
    @click="onClick"
    @keydown="interactive && onToggleKey($event, () => toggle($event))"
  >
    <template #corner>
      <CuiTileCornerButton :label="t('components.sensor_tile.message')" @click.stop="emit('expand', $event)">
        <PencilIcon />
      </CuiTileCornerButton>
    </template>
  </CuiTileCard>
</template>

<script setup lang="ts">
import { DisplayProperty } from '@camera.ui/sdk';
import PencilIcon from '~icons/mdi/pencil-outline';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileCard from '../frame/CuiTileCard.vue';
import CuiTileCornerButton from '../frame/CuiTileCornerButton.vue';
import { onToggleKey } from '../keys.js';
import { useSensorMoments } from '../useSensorMoments.js';
import { useTileSensor } from '../useTileSensor.js';
import { useDisplay } from './useDisplay.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const SHOWN_PROPERTIES = [DisplayProperty.Message, DisplayProperty.Preset];

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { color, shown, stateText, show, showPreset, clear } = useDisplay(() => props.sensor);
const { moments } = useSensorMoments(() => props.sensor, SHOWN_PROPERTIES);

const shownAtStart = SHOWN_PROPERTIES.map((property) => ({ property, value: props.sensor.getProperty<string>(property) })).find((entry) => entry.value);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const lastShown = computed(() => moments.value[0] ?? shownAtStart);

function onClick(event: MouseEvent) {
  if (interactive.value && !(event.target as Element).closest('button')) toggle(event);
}

function toggle(event: Event) {
  if (shown.value) return clear();
  const last = lastShown.value;
  if (!last) return emit('expand', event);
  if (last.property === DisplayProperty.Preset) showPreset(String(last.value));
  else show(String(last.value));
}
</script>
