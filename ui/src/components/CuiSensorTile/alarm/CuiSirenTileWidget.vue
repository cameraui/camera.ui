<template>
  <CuiTileWidget
    :icon
    :title="name"
    :state="hint ? t('components.sensor_tile.hold_to_sound') : typeLabel"
    :summary="hint ? t('components.sensor_tile.hold_to_sound') : stateText"
    :color
    :active
    :offline="!online"
    :hero="stateText"
    @open="emit('expand', $event)"
  >
    <template v-if="!disabled" #default="{ form }">
      <CuiLevelBar
        v-if="form === 'tall' && hasVolume"
        :value="ratio"
        :label="propertyLabel(SirenProperty.Volume)"
        :color
        :disabled="!interactive"
        @input="inputVolume"
        @commit="commitVolume"
      />
      <CuiTileHoldAction
        show-label
        :icon="active ? SilenceIcon : SoundIcon"
        :label="t(`components.sensor_tile.${active ? 'silence' : 'sound'}`)"
        :color
        :active
        :guarded="!active"
        :interactive
        @press="setActive(!active)"
        @hint="hint = $event"
      />
    </template>
  </CuiTileWidget>
</template>

<script setup lang="ts">
import { SirenProperty } from '@camera.ui/sdk';
import SoundIcon from '~icons/mdi/bullhorn-outline';
import SilenceIcon from '~icons/mdi/volume-off';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiLevelBar from '../frame/CuiLevelBar.vue';
import CuiTileHoldAction from '../frame/CuiTileHoldAction.vue';
import CuiTileWidget from '../frame/CuiTileWidget.vue';
import { useTileSensor } from '../useTileSensor.js';
import { useSiren } from './useSiren.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { active, color, hasVolume, ratio, stateText, setActive, inputVolume, commitVolume, propertyLabel } = useSiren(() => props.sensor);

const hint = ref(false);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const typeLabel = computed(() => t(`components.camera_options.sensor_type_${props.sensor.type}`));
</script>
