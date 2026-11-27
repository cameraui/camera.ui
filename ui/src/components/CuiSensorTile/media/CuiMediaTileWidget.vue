<template>
  <CuiTileWidget
    :icon
    :title="name"
    :state="title ? stateWord : undefined"
    :summary="title ?? stateWord"
    :color
    :active="lit"
    :offline="!online"
    :hero="title ?? stateWord"
    :hero-note="title ? artist : undefined"
    @open="emit('expand', $event)"
  >
    <template v-if="hasPower && !disabled" #actions>
      <ToggleSwitch :model-value="on" :disabled="!interactive" :aria-label="t('components.sensor_tile.power')" @update:model-value="toggle" />
    </template>

    <template v-if="!disabled" #default="{ form }">
      <CuiLevelBar
        v-if="form === 'tall' && hasVolume"
        :value="ratio"
        :label="muted ? t('components.sensor_tile.muted') : `${percent} %`"
        :aria-label="propertyLabel(MediaPlayerProperty.Volume)"
        :color
        :disabled="!interactive"
        @input="inputVolume"
        @commit="commitVolume"
      />
      <CuiMediaTransport v-if="commands.length > 0" :commands :playing :interactive compact @command="command" />
    </template>
  </CuiTileWidget>
</template>

<script setup lang="ts">
import { MediaPlayerProperty } from '@camera.ui/sdk';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiLevelBar from '../frame/CuiLevelBar.vue';
import CuiTileWidget from '../frame/CuiTileWidget.vue';
import { useTileSensor } from '../useTileSensor.js';
import CuiMediaTransport from './CuiMediaTransport.vue';
import { useMediaPlayer } from './useMediaPlayer.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const {
  hasPower,
  on,
  lit,
  playing,
  color,
  hasVolume,
  ratio,
  percent,
  muted,
  commands,
  title,
  artist,
  stateWord,
  toggle,
  command,
  inputVolume,
  commitVolume,
  propertyLabel,
} = useMediaPlayer(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
</script>
