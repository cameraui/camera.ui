<template>
  <CuiTileWidget
    :icon
    :title="name"
    :state="cameraName ?? typeLabel"
    :summary="stateText"
    :color
    :active="moving"
    :offline="!online"
    :hero="stateText"
    @open="emit('expand', $event)"
  >
    <template v-if="!disabled" #default="{ form }">
      <CuiTileChoiceRow v-if="form === 'tall' && hasPresets" :options="presetOptions" :interactive="steerable" @select="goToPreset">
        <CuiTileAction
          v-if="morePresets > 0"
          show-label
          :label="t('components.sensor_tile.more_count', { count: morePresets })"
          :interactive="online"
          @click="emit('expand', $event)"
        />
      </CuiTileChoiceRow>
      <div class="ptz-widget__actions">
        <CuiTileAction v-if="hasHome" :icon="HomeIcon" :label="t('components.player.ptz_go_to_home')" :interactive="steerable" @click="goToHome" />
        <CuiTileAction show-label :icon="SteerIcon" :label="t('components.sensor_tile.controls')" :interactive="online" @click="emit('expand', $event)" />
      </div>
    </template>
  </CuiTileWidget>
</template>

<script setup lang="ts">
import { useCameraById } from '@camera.ui/browser';
import SteerIcon from '~icons/mdi/gamepad-variant-outline';
import HomeIcon from '~icons/mdi/home-outline';

import { sensorIcon } from '@/common/sensorDisplay.js';
import { useCameraPtz } from '@/components/CuiPTZControl/useCameraPtz.js';

import CuiTileAction from '../frame/CuiTileAction.vue';
import CuiTileChoiceRow from '../frame/CuiTileChoiceRow.vue';
import CuiTileWidget from '../frame/CuiTileWidget.vue';
import { useCameraName } from '../useCameraRecord.js';
import { useTileSensor } from '../useTileSensor.js';
import { PRESET_CHIPS, usePtzState } from './usePtzState.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { moving, color, stateText } = usePtzState(() => props.sensor);
const cameraName = useCameraName(props.sensor.boundCameraId);
const { camera } = useCameraById(() => props.sensor.boundCameraId ?? '');
const { hasHome, hasPresets, presets, goToHome, goToPreset } = useCameraPtz(camera);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const typeLabel = computed(() => t(`components.camera_options.sensor_type_${props.sensor.type}`));
const steerable = computed(() => interactive.value && hasPermission(undefined, 'admin'));
const presetOptions = computed(() => presets.value.slice(0, PRESET_CHIPS).map((preset) => ({ value: preset, label: preset })));
const morePresets = computed(() => presets.value.length - PRESET_CHIPS);
</script>

<style scoped>
.ptz-widget__actions {
  display: flex;
  gap: 0.5rem;
}
</style>
