<template>
  <CuiTileWidget
    :icon
    :title="name"
    :state="typeLabel"
    :summary="stateText"
    :color
    :active="!!shown"
    :offline="!online"
    :hero="shown || t('components.sensor_state.empty')"
    extra-shows-hero
    @open="emit('expand', $event)"
  >
    <template #extra>
      <CuiDisplayScreen :text="shown" :empty="t('components.sensor_state.empty')" fill />
    </template>

    <template v-if="!disabled" #default="{ form }">
      <CuiTileChoiceRow v-if="form === 'tall' && presets.length > 0" :options="presets" :selected="preset" :interactive @select="showPreset" />
      <CuiTileAction v-if="shown" show-label :icon="ClearIcon" :label="t('components.sensor_tile.clear_display')" :interactive @click="clear" />
      <CuiTileAction v-else show-label :icon="PencilIcon" :label="t('components.sensor_tile.message')" :interactive="online" @click="emit('expand', $event)" />
    </template>
  </CuiTileWidget>
</template>

<script setup lang="ts">
import ClearIcon from '~icons/mdi/eraser';
import PencilIcon from '~icons/mdi/pencil-outline';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileAction from '../frame/CuiTileAction.vue';
import CuiTileChoiceRow from '../frame/CuiTileChoiceRow.vue';
import CuiTileWidget from '../frame/CuiTileWidget.vue';
import { useTileSensor } from '../useTileSensor.js';
import CuiDisplayScreen from './CuiDisplayScreen.vue';
import { useDisplay } from './useDisplay.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { color, preset, presets, shown, stateText, showPreset, clear } = useDisplay(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const typeLabel = computed(() => t(`components.camera_options.sensor_type_${props.sensor.type}`));
</script>
