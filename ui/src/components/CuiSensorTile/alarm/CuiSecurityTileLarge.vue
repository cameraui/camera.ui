<template>
  <CuiTilePanel fit :icon :title="name" :state="t(`components.camera_options.sensor_type_${sensor.type}`)" :color :active="wantsArmed || triggered" :offline="!online">
    <div class="flex flex-col items-center gap-4">
      <CuiAlarmScene class="tile-art" :icon :active="triggered" :calm />

      <div v-if="!disabled" class="flex flex-wrap justify-center gap-4">
        <CuiTileControl :caption="t('components.sensor_tile.disarm')">
          <CuiHoldButton
            :icon="DisarmIcon"
            :label="t('components.sensor_tile.disarm')"
            :active="!wantsArmed && !triggered"
            :guarded
            :interactive
            @press="disarm"
            @hint="(shown) => (hint = shown)"
          />
        </CuiTileControl>
        <CuiTileControl v-for="mode in armModes" :key="mode" :caption="modeLabel(mode)">
          <CuiTileButton :icon="securityModeIcon(mode)" :label="modeLabel(mode)" :color="securityColor(mode)" :active="target === mode" :interactive @click="arm(mode)" />
        </CuiTileControl>
      </div>
      <span v-if="!disabled" class="text-xs text-muted security-large__hint" :class="{ 'security-large__hint--shown': hint }">{{
        t('components.sensor_tile.hold_to_disarm')
      }}</span>

      <CuiTileReading :state="stateText" :detail="sinceText ?? ''" />

      <CuiTileTimeline :sensor :property="SecuritySystemProperty.CurrentState" :entries :now :color-of="securityColor" />
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import { SecuritySystemProperty } from '@camera.ui/sdk';
import DisarmIcon from '~icons/mdi/shield-off-outline';

import { securityColor, sensorIcon } from '@/common/sensorDisplay.js';

import CuiAlarmScene from '../binary/CuiAlarmScene.vue';
import CuiHoldButton from '../frame/CuiHoldButton.vue';
import CuiTileButton from '../frame/CuiTileButton.vue';
import CuiTileControl from '../frame/CuiTileControl.vue';
import CuiTilePanel from '../frame/CuiTilePanel.vue';
import CuiTileReading from '../frame/CuiTileReading.vue';
import CuiTileTimeline from '../frame/CuiTileTimeline.vue';
import { useSensorHistory } from '../useSensorHistory.js';
import { useTileSensor } from '../useTileSensor.js';
import { securityModeIcon } from './modes.js';
import { useSecuritySystem } from './useSecuritySystem.js';

import type { SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { target, triggered, wantsArmed, guarded, armModes, color, calm, stateText, modeLabel, arm, disarm } = useSecuritySystem(() => props.sensor);
const { entries, now, sinceText } = useSensorHistory(
  () => props.sensor,
  () => SecuritySystemProperty.CurrentState,
);

const hint = ref(false);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
</script>

<style scoped>
.security-large__hint {
  margin-top: -0.5rem;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.security-large__hint--shown {
  opacity: 1;
}
</style>
