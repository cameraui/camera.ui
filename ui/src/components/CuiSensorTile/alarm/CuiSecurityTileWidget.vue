<template>
  <CuiTileWidget
    :icon
    :title="name"
    :state="hint ? t('components.sensor_tile.hold_to_disarm') : sinceText"
    :summary="hint ? t('components.sensor_tile.hold_to_disarm') : stateText"
    :color
    :active="wantsArmed || triggered"
    :offline="!online"
    :hero="stateText"
    @open="emit('expand', $event)"
  >
    <template #default="{ form }">
      <CuiTileTimeline v-if="form === 'tall'" bare :sensor :property="SecuritySystemProperty.CurrentState" :entries :now :color-of="securityColor" />

      <div v-if="!disabled" class="security-widget__modes">
        <CuiTileHoldAction
          :icon="DisarmIcon"
          :label="t('components.sensor_tile.disarm')"
          :active="!wantsArmed && !triggered"
          :guarded
          :interactive
          @press="disarm"
          @hint="hint = $event"
        />
        <CuiTileAction
          v-for="mode in armModes"
          :key="mode"
          :icon="securityModeIcon(mode)"
          :label="modeLabel(mode)"
          :color="securityColor(mode)"
          :active="target === mode"
          :interactive
          @click="arm(mode)"
        />
      </div>
    </template>
  </CuiTileWidget>
</template>

<script setup lang="ts">
import { SecuritySystemProperty } from '@camera.ui/sdk';
import DisarmIcon from '~icons/mdi/shield-off-outline';

import { securityColor, sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileAction from '../frame/CuiTileAction.vue';
import CuiTileHoldAction from '../frame/CuiTileHoldAction.vue';
import CuiTileTimeline from '../frame/CuiTileTimeline.vue';
import CuiTileWidget from '../frame/CuiTileWidget.vue';
import { useSensorHistory } from '../useSensorHistory.js';
import { useTileSensor } from '../useTileSensor.js';
import { securityModeIcon } from './modes.js';
import { useSecuritySystem } from './useSecuritySystem.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { target, triggered, wantsArmed, guarded, armModes, color, stateText, modeLabel, arm, disarm } = useSecuritySystem(() => props.sensor);
const { entries, now, sinceText } = useSensorHistory(
  () => props.sensor,
  () => SecuritySystemProperty.CurrentState,
);

const hint = ref(false);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
</script>

<style scoped>
.security-widget__modes {
  display: flex;
  gap: 0.5rem;
}
</style>
