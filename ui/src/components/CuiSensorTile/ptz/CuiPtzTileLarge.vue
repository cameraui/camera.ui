<template>
  <CuiTilePanel fit :icon :title="name" :state="t(`components.camera_options.sensor_type_${sensor.type}`)" :color :active="moving" :offline="!online">
    <div class="flex flex-col items-center gap-4">
      <div class="ptz-view">
        <CuiCameraCard
          v-if="cameraRecord"
          source-role="low-resolution"
          activity-mode="always-on"
          streaming-mode="auto"
          :camera-info="cameraRecord"
          :toolbar="false"
          :control="false"
          :subcontrol="false"
          :isolated-stream="true"
          :double-click-zoom="false"
          card-click-action="none"
          live-indicator-overlay
          flat-card
          class="w-full"
        />
        <div v-if="steerable && camera" class="ptz-view__pad">
          <CuiPTZControl :camera-device="camera" size="small" />
        </div>
      </div>

      <CuiTileReading :state="stateText" />

      <CuiTileControl v-if="hasHome && !disabled" :caption="t('components.player.ptz_go_to_home')">
        <CuiTileButton :icon="HomeIcon" :label="t('components.player.ptz_go_to_home')" :color :interactive="steerable" @click="goToHome" />
      </CuiTileControl>

      <CuiTileChips
        v-if="hasPresets && !disabled"
        :label="t('components.player.ptz_presets')"
        :options="presetOptions"
        :limit="PRESET_CHIPS"
        :disabled="!steerable"
        @select="goToPreset"
      />
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import { useCameraById } from '@camera.ui/browser';
import HomeIcon from '~icons/mdi/home-outline';

import { sensorIcon } from '@/common/sensorDisplay.js';
import { useCameraPtz } from '@/components/CuiPTZControl/useCameraPtz.js';

import CuiTileButton from '../frame/CuiTileButton.vue';
import CuiTileChips from '../frame/CuiTileChips.vue';
import CuiTileControl from '../frame/CuiTileControl.vue';
import CuiTilePanel from '../frame/CuiTilePanel.vue';
import CuiTileReading from '../frame/CuiTileReading.vue';
import { useCameraRecord } from '../useCameraRecord.js';
import { useTileSensor } from '../useTileSensor.js';
import { PRESET_CHIPS, usePtzState } from './usePtzState.js';

import type { SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { moving, color, stateText } = usePtzState(() => props.sensor);
const cameraRecord = useCameraRecord(props.sensor.boundCameraId);
const { camera } = useCameraById(() => props.sensor.boundCameraId ?? '');
const { hasHome, hasPresets, presets, goToHome, goToPreset } = useCameraPtz(camera);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const steerable = computed(() => interactive.value && hasPermission(undefined, 'admin'));
const presetOptions = computed(() => presets.value.map((preset) => ({ value: preset, label: preset })));
</script>

<style scoped>
.ptz-view {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 0.75rem;
  overflow: hidden;
  background: #000;
}

.ptz-view__pad {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
