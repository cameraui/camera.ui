<template>
  <CuiTileHoldAction
    v-if="variant === 'key'"
    class="home-lock-key"
    :icon
    :label="keyLabel"
    :color
    :active="locked || jammed"
    :guarded="locked"
    :interactive
    :waiting
    :failed
    @press="press"
    @hint="emit('hint', $event)"
  />
  <CuiHomeChip
    v-else-if="variant === 'chip'"
    :sensor
    :label="name"
    :icon
    :on="locked || jammed"
    :color
    :aria-label="keyLabel"
    large
    :offline="!online"
    pressable
    :guarded="locked"
    :interactive
    @press="press"
    @hint="emit('hint', $event)"
  />
  <CuiHomeStatusRow v-else :sensor :icon :name :state :on="locked || jammed" :color :offline="!online">
    <CuiTileHoldAction
      v-if="!disabled"
      :class="{ 'home-lock-key': narrow }"
      :show-label="!narrow"
      :icon="narrow ? ACTION_ICONS[action] : undefined"
      :label="actionLabel"
      :aria-label="actionAria"
      :guarded="locked"
      :interactive
      @press="press"
      @hint="emit('hint', $event)"
    />
  </CuiHomeStatusRow>
</template>

<script setup lang="ts">
import LockAlertIcon from '~icons/mdi/lock-alert-outline';
import UnlockIcon from '~icons/mdi/lock-open-variant-outline';
import LockIcon from '~icons/mdi/lock-outline';
import RetryIcon from '~icons/mdi/refresh';

import CuiTileHoldAction from '@/components/CuiSensorTile/frame/CuiTileHoldAction.vue';
import { useLock } from '@/components/CuiSensorTile/lock/useLock.js';
import { useTileWait } from '@/components/CuiSensorTile/useTileWait.js';

import CuiHomeChip from './CuiHomeChip.vue';
import CuiHomeStatusRow from './CuiHomeStatusRow.vue';
import { doorText } from './locks.js';

import type { CuiHomeLockItemEmits, CuiHomeLockItemProps } from './locks.js';

const props = defineProps<CuiHomeLockItemProps>();
const emit = defineEmits<CuiHomeLockItemEmits>();

const { t } = useI18n();

const { jammed, wantsLocked, color, stateText, lock, unlock, retry } = useLock(() => props.sensor);
const { waiting, failed, note } = useTileWait(() => (props.variant === 'key' ? props.sensor : undefined));

const ACTIONS = { jammed: 'retry', locked: 'unlock', unlocked: 'lock' } as const;
const ACTION_ICONS = { retry: RetryIcon, unlock: UnlockIcon, lock: LockIcon };

const name = computed(() => props.sensor.displayName.value);
const online = computed(() => props.sensor.online.value);
const interactive = computed(() => !props.disabled && online.value);
const locked = computed(() => wantsLocked.value && !jammed.value);
const icon = computed(() => (jammed.value ? LockAlertIcon : locked.value ? LockIcon : UnlockIcon));
const mode = computed(() => (jammed.value ? 'jammed' : locked.value ? 'locked' : 'unlocked'));
const keyLabel = computed(() => t(`views.home_dashboard.groups.locks.key_${mode.value}`, { name: name.value }));
const action = computed(() => ACTIONS[mode.value]);
const actionLabel = computed(() => t(`components.sensor_tile.${action.value}`));
const actionAria = computed(() => t(`views.home_dashboard.groups.locks.${action.value}_name`, { name: name.value }));
const state = computed(() => {
  const door = props.door && doorText(props.door, t);
  return door ? `${stateText.value} · ${door}` : stateText.value;
});

watch(note, (text) => emit('note', text));

function press() {
  if (jammed.value) retry();
  else if (locked.value) unlock();
  else lock();
}
</script>

<style scoped>
.home-lock-key.tile-action {
  flex: none;
  aspect-ratio: 1;
}
</style>
