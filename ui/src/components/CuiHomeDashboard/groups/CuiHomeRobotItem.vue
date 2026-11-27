<template>
  <div
    v-if="variant === 'cell'"
    class="cui-tile home-robot-cell"
    :class="{ 'home-robot-cell--offline': !online, 'home-robot-cell--interactive': interactive }"
    :style="{ '--tile-color': color }"
  >
    <button type="button" class="home-robot-cell__press" :aria-label="ariaLabel" @click="interactive && press()" />
    <span class="home-robot-cell__name">
      <CuiHomeMemberIcon class="home-robot-cell__lead cui-wait-ring" :class="{ 'cui-wait-ring--on': waiting, 'cui-wait-ring--failed': failed }" :sensor
        ><component :is="icon" class="home-robot-cell__icon"
      /></CuiHomeMemberIcon>
      <span class="home-robot-cell__label">{{ name }}</span>
    </span>
    <span class="home-robot-cell__word" :class="{ 'home-robot-cell__word--on': lit }">{{ note ?? stateText }}</span>
    <span class="home-robot-cell__detail"><CuiHomeRobotBattery v-if="battery" :battery /></span>
  </div>
  <CuiHomeChip
    v-else-if="variant === 'chip'"
    :sensor
    :label="name"
    :detail="battery && `${battery.level} %`"
    :icon
    :on="lit"
    :color
    :aria-label="ariaLabel"
    large
    :offline="!online"
    pressable
    :interactive
    @press="press"
  />
  <CuiHomeStatusRow v-else class="home-robot-row" :sensor :icon :name :state="stateText" :on="lit" :color :offline="!online">
    <template #state>{{ battery ? `${stateText} · ` : stateText }}<CuiHomeRobotBattery v-if="battery" :battery /></template>
    <CuiTileAction
      v-if="main && !disabled"
      class="home-robot-row__action"
      :icon="main === VacuumCommand.Pause ? PauseIcon : PlayIcon"
      :label="t(`views.home_dashboard.groups.robots.${main === VacuumCommand.Pause ? 'pause_name' : 'start_name'}`, { name })"
      :interactive
      @click="press"
    />
  </CuiHomeStatusRow>
</template>

<script setup lang="ts">
import { VacuumCommand } from '@camera.ui/sdk';
import PauseIcon from '~icons/mdi/pause';
import PlayIcon from '~icons/mdi/play';

import { sensorIcon } from '@/common/sensorDisplay.js';
import CuiTileAction from '@/components/CuiSensorTile/frame/CuiTileAction.vue';
import { mainCommand, useRobot } from '@/components/CuiSensorTile/robot/useRobot.js';
import { useTileWait } from '@/components/CuiSensorTile/useTileWait.js';

import CuiHomeChip from './CuiHomeChip.vue';
import CuiHomeMemberIcon from './CuiHomeMemberIcon.vue';
import CuiHomeRobotBattery from './CuiHomeRobotBattery.vue';
import CuiHomeStatusRow from './CuiHomeStatusRow.vue';
import { robotLit } from './robots.js';

import type { CuiHomeRobotItemProps } from './robots.js';

const props = defineProps<CuiHomeRobotItemProps>();

const { t } = useI18n();

const { busy, color, commands, stateText, command } = useRobot(() => props.sensor);

const { waiting, failed, note } = useTileWait(() => (props.variant === 'cell' ? props.sensor : undefined));

const name = computed(() => props.sensor.displayName.value);
const online = computed(() => props.sensor.online.value);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const lit = computed(() => robotLit(props.sensor));
const main = computed(() => mainCommand(commands.value, busy.value));
const interactive = computed(() => !props.disabled && online.value && !!main.value);
const ariaLabel = computed(() => {
  const state = stateText.value;
  if (!props.battery) return t('views.home_dashboard.groups.robots.member', { name: name.value, state });
  return t('views.home_dashboard.groups.robots.member_battery', { name: name.value, state, level: props.battery.level });
});

function press() {
  if (main.value) command(main.value);
}
</script>

<style scoped>
.home-robot-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0.125rem;
  width: 100%;
  min-width: 0;
  height: 5rem;
  padding: 0.625rem 0.75rem;
  border-radius: 1rem;
  background: var(--p-content-hover-background);
  color: var(--text-color);
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.15s ease;
}

.home-robot-cell__press {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  cursor: default;
}

.home-robot-cell--interactive .home-robot-cell__press {
  cursor: pointer;
}

.home-robot-cell--interactive:has(> .home-robot-cell__press:active) {
  transform: scale(0.97);
}

.home-robot-cell:has(> .home-robot-cell__press:focus-visible) {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.home-robot-cell__press:focus-visible {
  outline: none;
}

.home-robot-cell--offline {
  opacity: 0.55;
}

.home-robot-cell__label,
.home-robot-cell__word,
.home-robot-cell__detail {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-robot-cell__name,
.home-robot-cell__detail {
  font-size: 0.75rem;
  line-height: 0.9375rem;
  color: var(--text-secondary-color);
}

.home-robot-cell__name {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  max-width: 100%;
  font-weight: 500;
}

.home-robot-cell__lead {
  position: relative;
  z-index: 1;
  display: flex;
  flex-shrink: 0;
  border-radius: 50%;
}

.home-robot-cell__lead::before {
  content: '';
  position: absolute;
  inset: -0.5rem;
}

.home-robot-cell__icon {
  width: 0.8125rem;
  height: 0.8125rem;
}

.home-robot-cell__word {
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.375rem;
}

.home-robot-cell__word--on {
  color: var(--tile-ink);
}

.home-robot-cell__detail {
  min-height: 0.9375rem;
  pointer-events: none;
}

.home-robot-row.home-status-row {
  height: 3rem;
}

.home-robot-row :deep(.home-status-row__icon) {
  width: 2rem;
  height: 2rem;
}

.home-robot-row__action {
  width: 2.25rem;
}
</style>
