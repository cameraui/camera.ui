<template>
  <div class="cui-tile home-valve-row" :style="{ '--tile-color': zone.color }">
    <CuiHomeMemberIcon v-if="lead" class="home-valve-row__lead" :sensor="zone.sensor">
      <CuiTileIcon class="home-valve-row__icon" :icon :active="zone.running" />
    </CuiHomeMemberIcon>
    <span class="home-valve-row__text">
      <span class="home-valve-row__name">{{ zone.label }}</span>
      <span class="home-valve-row__state" :class="{ 'home-valve-row__state--note': note }">{{ state }}</span>
      <span v-if="zone.share !== undefined" class="home-valve-row__progress">
        <span class="home-valve-row__bar" :style="{ width: `${zone.share * 100}%` }" />
      </span>
    </span>
    <CuiTileHoldAction
      v-if="!disabled"
      class="home-valve-row__action"
      :icon="zone.running ? StopIcon : PlayIcon"
      :label="t(`views.home_dashboard.groups.valves.${zone.running ? 'stop_name' : 'start_name'}`, { name: zone.label })"
      :guarded="zone.gas && !zone.running"
      :interactive="zone.sensor.online.value"
      @press="emit('toggle')"
      @hint="emit('hint', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { SensorType } from '@camera.ui/sdk';
import PlayIcon from '~icons/lucide/play';
import StopIcon from '~icons/lucide/square';

import { sensorIcon } from '@/common/sensorDisplay.js';
import CuiTileHoldAction from '@/components/CuiSensorTile/frame/CuiTileHoldAction.vue';
import CuiTileIcon from '@/components/CuiSensorTile/frame/CuiTileIcon.vue';
import { TILE_WAIT } from '@/components/CuiSensorTile/types.js';
import { useTileWait } from '@/components/CuiSensorTile/useTileWait.js';
import { clock } from '@/components/CuiSensorTile/valve/useValve.js';

import CuiHomeMemberIcon from './CuiHomeMemberIcon.vue';

import type { CuiHomeValveRowEmits, CuiHomeValveRowProps } from './valves.js';

const props = defineProps<CuiHomeValveRowProps>();
const emit = defineEmits<CuiHomeValveRowEmits>();

const { t } = useI18n();

const wait = useTileWait(() => props.zone.sensor);
const { note } = wait;
provide(TILE_WAIT, wait);

const icon = computed(() => sensorIcon(SensorType.Valve, props.zone.sensor));
const state = computed(() => {
  const { sensor, running, remaining, minutes } = props.zone;
  if (!sensor.online.value) return t('connection.offline');
  if (note.value) return note.value;
  if (running) return remaining ? t('views.home_dashboard.groups.valves.left', { time: clock(remaining) }) : t('components.sensor_state.open');
  return minutes ? t('components.sensor_tile.minutes', { count: minutes }) : t('components.sensor_state.closed');
});
</script>

<style scoped>
.home-valve-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  height: 3rem;
  padding: 0 0.5rem 0 0.625rem;
  border-radius: 1rem;
  background: var(--p-content-hover-background);
}

.home-valve-row__lead {
  display: flex;
  flex-shrink: 0;
  border-radius: 50%;
}

.home-valve-row .home-valve-row__icon {
  width: 2rem;
  height: 2rem;
}

.home-valve-row__icon:not(.tile-icon--active) {
  background: color-mix(in srgb, var(--text-color) 7%, var(--p-content-hover-background));
}

.home-valve-row__icon :deep(.tile-icon__svg) {
  width: 1.125rem;
  height: 1.125rem;
}

.home-valve-row__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.home-valve-row__name,
.home-valve-row__state {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-valve-row__name {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.125rem;
  color: var(--text-color);
}

.home-valve-row__state {
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--text-secondary-color);
  font-variant-numeric: tabular-nums;
}

.home-valve-row .home-valve-row__state--note {
  color: var(--p-red-500);
}

.home-valve-row__progress {
  height: 0.1875rem;
  margin-top: 0.25rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--text-color) 15%, var(--p-content-hover-background));
  overflow: hidden;
}

.home-valve-row__bar {
  display: block;
  height: 100%;
  background: var(--tile-color);
  transition: width 1s linear;
}

.home-valve-row .home-valve-row__action {
  flex: none;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.875rem;
  background: color-mix(in srgb, var(--text-color) 7%, var(--p-content-hover-background));
}
</style>
