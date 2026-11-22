<template>
  <CuiTilePanel :icon :title="name" :state="t(`components.camera_options.sensor_type_${sensor.type}`)" :color :active="wantsArmed || triggered" :offline="!online">
    <div class="flex flex-col items-center gap-4">
      <CuiAlarmScene :icon :active="triggered" :calm />

      <div class="flex flex-wrap justify-center gap-4">
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
          <CuiTileButton :icon="MODE_ICONS[mode] ?? AwayIcon" :label="modeLabel(mode)" :color="okColor" :active="target === mode" :interactive @click="arm(mode)" />
        </CuiTileControl>
      </div>
      <span class="text-xs text-muted security-large__hint" :class="{ 'security-large__hint--shown': hint }">{{ t('components.sensor_tile.hold_to_disarm') }}</span>

      <CuiTileReading :state="stateText" :detail="sinceText" />

      <CuiTileTimeline :sensor :property="SecuritySystemProperty.CurrentState" :entries :now :color-of="timelineColor" />
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import { SecuritySystemProperty, SecuritySystemState } from '@camera.ui/sdk';
import DisarmIcon from '~icons/mdi/shield-off-outline';
import HomeIcon from '~icons/mdi/shield-home';
import AwayIcon from '~icons/mdi/shield-lock';
import NightIcon from '~icons/mdi/shield-moon';

import { sensorIcon, toneColor } from '@/common/sensorDisplay.js';

import CuiAlarmScene from '../binary/CuiAlarmScene.vue';
import CuiHoldButton from '../frame/CuiHoldButton.vue';
import CuiTileButton from '../frame/CuiTileButton.vue';
import CuiTileControl from '../frame/CuiTileControl.vue';
import CuiTilePanel from '../frame/CuiTilePanel.vue';
import CuiTileReading from '../frame/CuiTileReading.vue';
import CuiTileTimeline from '../frame/CuiTileTimeline.vue';
import { useSensorHistory } from '../useSensorHistory.js';
import { useTileSensor } from '../useTileSensor.js';
import { useSecuritySystem } from './useSecuritySystem.js';

import type { SensorTileProps } from '../types.js';
import type { Component } from 'vue';

const MODE_ICONS: Partial<Record<number, Component>> = {
  [SecuritySystemState.StayArm]: HomeIcon,
  [SecuritySystemState.AwayArm]: AwayIcon,
  [SecuritySystemState.NightArm]: NightIcon,
};

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { target, triggered, wantsArmed, guarded, armModes, color, calm, stateText, modeLabel, arm, disarm, timelineColor } = useSecuritySystem(() => props.sensor);
const { entries, now, sinceText } = useSensorHistory(
  () => props.sensor,
  () => SecuritySystemProperty.CurrentState,
);

const hint = ref(false);
const okColor = toneColor('ok');
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
