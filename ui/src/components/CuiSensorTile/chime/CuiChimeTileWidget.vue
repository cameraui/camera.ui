<template>
  <CuiTileWidget :icon :title="name" :state="typeLabel" :summary="stateText" :color :active :offline="!online" :hero="stateText" @open="emit('expand', $event)">
    <template v-if="!disabled" #default="{ form }">
      <template v-if="form === 'tall'">
        <CuiTileChoiceRow v-if="tones.length > 1" :options="tones" :selected="tone" :interactive @select="setTone" />
        <CuiLevelBar
          v-else-if="hasVolume"
          :value="ratio"
          :label="`${percent} %`"
          :aria-label="propertyLabel(ChimeProperty.Volume)"
          :color
          :disabled="!interactive"
          @input="inputVolume"
          @commit="commitVolume"
        />
      </template>
      <CuiTileAction
        show-label
        :icon="active ? StopIcon : PlayIcon"
        :label="t(`components.sensor_tile.${active ? 'stop' : 'play'}`)"
        :color
        :active
        :interactive
        @click="toggle"
      />
    </template>
  </CuiTileWidget>
</template>

<script setup lang="ts">
import { ChimeProperty } from '@camera.ui/sdk';
import PlayIcon from '~icons/mdi/play';
import StopIcon from '~icons/mdi/stop';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiLevelBar from '../frame/CuiLevelBar.vue';
import CuiTileAction from '../frame/CuiTileAction.vue';
import CuiTileChoiceRow from '../frame/CuiTileChoiceRow.vue';
import CuiTileWidget from '../frame/CuiTileWidget.vue';
import { useTileSensor } from '../useTileSensor.js';
import { useChime } from './useChime.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { active, color, tones, tone, hasVolume, ratio, percent, stateText, toggle, setTone, inputVolume, commitVolume, propertyLabel } = useChime(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const typeLabel = computed(() => t(`components.camera_options.sensor_type_${props.sensor.type}`));
</script>
