<template>
  <CuiTileWidget
    :icon
    :title="name"
    :state="hint ? t('components.sensor_tile.hold_to_unlock') : sinceText"
    :summary="hint ? t('components.sensor_tile.hold_to_unlock') : stateText"
    :color
    :active="jammed || wantsLocked"
    :offline="!online"
    :hero="stateText"
    @open="emit('expand', $event)"
  >
    <template #default="{ form }">
      <CuiTileTimeline v-if="form === 'tall'" bare :sensor :property="LockProperty.CurrentState" :entries :now :color-of="timelineColor" />

      <template v-if="!disabled">
        <CuiTileAction v-if="jammed" show-label :icon="RetryIcon" :label="t('components.sensor_tile.retry')" :color :interactive @click="retry" />
        <CuiTileHoldAction
          v-else
          show-label
          :icon="wantsLocked ? UnlockIcon : LockIcon"
          :label="t(`components.sensor_tile.${wantsLocked ? 'unlock' : 'lock'}`)"
          :guarded="wantsLocked"
          :interactive
          @press="wantsLocked ? unlock() : lock()"
          @hint="hint = $event"
        />
      </template>
    </template>
  </CuiTileWidget>
</template>

<script setup lang="ts">
import { LockProperty } from '@camera.ui/sdk';
import LockIcon from '~icons/mdi/lock-outline';
import UnlockIcon from '~icons/mdi/lock-open-variant-outline';
import RetryIcon from '~icons/mdi/refresh';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileAction from '../frame/CuiTileAction.vue';
import CuiTileHoldAction from '../frame/CuiTileHoldAction.vue';
import CuiTileTimeline from '../frame/CuiTileTimeline.vue';
import CuiTileWidget from '../frame/CuiTileWidget.vue';
import { useSensorHistory } from '../useSensorHistory.js';
import { useTileSensor } from '../useTileSensor.js';
import { useLock } from './useLock.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { jammed, wantsLocked, color, stateText, lock, unlock, retry, timelineColor } = useLock(() => props.sensor);
const { entries, now, sinceText } = useSensorHistory(
  () => props.sensor,
  () => LockProperty.CurrentState,
);

const hint = ref(false);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
</script>
