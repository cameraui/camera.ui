<template>
  <CuiTileWidget
    ref="widgetRef"
    class="home-locks"
    :icon="LockIcon"
    :title="name"
    :state="hint ? t('components.sensor_tile.hold_to_unlock') : stateText"
    :note="keyNote"
    :summary="summary"
    :color
    :active="allLocked"
    :offline
    :hero
    :hero-note="heroNote"
    hero-word
    extra-shows-hero
    @open="listRef?.toggle($event)"
  >
    <template v-if="canLockAll && !narrow" #actions>
      <CuiTileAction class="home-locks__pill" show-label :icon="LockIcon" :label="t('views.home_dashboard.groups.locks.lock_all')" :interactive @click="lockAll" />
    </template>

    <template #extra>
      <CuiHomePager class="home-locks__rows" :items="members" :row-height="ROW_HEIGHT" :min-width="ROW_WIDTH" :item-key="(member) => member.id">
        <template #default="{ item }">
          <CuiHomeLockItem v-if="item.type === SensorType.Lock" :sensor="item" variant="row" :door="doors.get(item.id)" :narrow :disabled @hint="hint = $event" />
          <CuiHomeStatusRow v-else v-bind="contactLooks.get(item.id)!" />
        </template>
      </CuiHomePager>
    </template>

    <template v-if="form === 'tall'">
      <CuiTileAction v-if="narrow && canLockAll" v-bind="lockAllButton" @click="lockAll" />
    </template>
    <div v-else-if="narrow" class="home-locks__stack">
      <div v-if="showsKeys" ref="keysRef" class="home-locks__keys">
        <CuiHomeLockItem v-for="lock in keys" :key="lock.id" :sensor="lock" variant="key" :disabled @hint="hint = $event" @note="setKeyNote(lock.id, $event)" />
        <button
          v-if="hiddenKeys"
          type="button"
          class="home-locks__more"
          :class="{ 'home-locks__more--compact': form === 'compact' }"
          :aria-label="t('components.sensor_tile.more_count', { count: hiddenKeys })"
          @click="listRef?.toggle($event)"
        >
          +{{ hiddenKeys }}
        </button>
      </div>
      <CuiTileAction v-if="canLockAll" v-bind="lockAllButton" @click="lockAll" />
    </div>
    <CuiHomePager v-else :items="members" :row-height="CHIP_HEIGHT" :min-width="CHIP_WIDTH" :item-key="(member) => member.id">
      <template #default="{ item }">
        <CuiHomeLockItem v-if="item.type === SensorType.Lock" :sensor="item" variant="chip" :disabled @hint="hint = $event" />
        <CuiHomeChip v-else v-bind="contactChip(item)" />
      </template>
    </CuiHomePager>
  </CuiTileWidget>

  <CuiPopoverSheet ref="listRef" width="18rem">
    <div class="home-locks__list">
      <template v-for="member in members" :key="member.id">
        <CuiHomeLockItem v-if="member.type === SensorType.Lock" :sensor="member" variant="row" :door="doors.get(member.id)" :narrow="false" :disabled />
        <CuiHomeStatusRow v-else v-bind="contactLooks.get(member.id)!" />
      </template>
    </div>
  </CuiPopoverSheet>

  <CuiSensorTileSheet v-if="sheetSensor" ref="sheetRef" :sensor="sheetSensor" :disabled />
</template>

<script setup lang="ts">
import { ContactProperty, SensorType } from '@camera.ui/sdk';
import LockIcon from '~icons/mdi/lock-outline';

import { sensorIcon, sensorStatus, toneColor } from '@/common/sensorDisplay.js';
import CuiPopoverSheet from '@/components/CuiPopoverSheet/CuiPopoverSheet.vue';
import CuiSensorTileSheet from '@/components/CuiSensorTile/CuiSensorTileSheet.vue';
import CuiTileAction from '@/components/CuiSensorTile/frame/CuiTileAction.vue';
import CuiTileWidget from '@/components/CuiSensorTile/frame/CuiTileWidget.vue';

import CuiHomePager from '../CuiHomePager.vue';
import CuiHomeChip from './CuiHomeChip.vue';
import CuiHomeLockItem from './CuiHomeLockItem.vue';
import CuiHomeStatusRow from './CuiHomeStatusRow.vue';
import { useLockGroup } from './locks.js';
import { useMemberSheet } from './memberSheet.js';
import { useCompactSpace } from './status.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { CuiHomeGroupDesignProps } from '../types.js';

const props = defineProps<CuiHomeGroupDesignProps>();

const { t } = useI18n();

const { locks, doors, loose, unlocked, allLocked, color, stateText, lockAll } = useLockGroup(() => props.sensors);

const ROW_WIDTH = 260;
const ROW_HEIGHT = 56;
const CHIP_WIDTH = 120;
const CHIP_HEIGHT = 36;
const KEY = 48;
const COMPACT_KEY = 40;
const KEY_GAP = 8;

const widgetRef = useTemplateRef<InstanceType<typeof CuiTileWidget>>('widgetRef');
const keysRef = useTemplateRef<HTMLDivElement>('keysRef');
const listRef = useTemplateRef<InstanceType<typeof CuiPopoverSheet>>('listRef');
const sheetRef = useTemplateRef<InstanceType<typeof CuiSensorTileSheet>>('sheetRef');
const hint = ref(false);
const keyNotes = reactive(new Map<string, string>());

const { sheetSensor } = useMemberSheet(sheetRef);

const widgetEl = computed(() => widgetRef.value?.$el as HTMLElement | undefined);
const compactSpace = useCompactSpace(widgetEl);
const { width: keysWidth } = useElementSize(keysRef);

const form = computed(() => widgetRef.value?.form ?? 'short');
const narrow = computed(() => widgetRef.value?.narrow ?? false);
const members = computed(() => [...locks.value, ...loose.value]);
const offline = computed(() => members.value.every((member) => !member.online.value));
const interactive = computed(() => !props.disabled && locks.value.some((lock) => lock.online.value));
const canLockAll = computed(() => !props.disabled && unlocked.value.length > 0);
const summary = computed(() => {
  if (hint.value) return t('views.home_dashboard.groups.locks.hold');
  return allLocked.value ? t('components.sensor_state.locked') : stateText.value;
});
const hero = computed(() => {
  if (allLocked.value) return t('components.sensor_state.locked');
  if (unlocked.value.length === 1) return unlocked.value[0].displayName.value;
  if (unlocked.value.length) return t('views.home_dashboard.groups.locks.open', { count: unlocked.value.length });
  return stateText.value;
});
const keyNote = computed(() => [...keyNotes.values()].at(-1));
const heroNote = computed(() => (unlocked.value.length === 1 && !narrow.value ? t('views.home_dashboard.groups.locks.note_unlocked') : undefined));
const stackFits = computed(() => compactSpace.value >= 2 * COMPACT_KEY + KEY_GAP);
const showsKeys = computed(() => !canLockAll.value || (form.value === 'compact' && stackFits.value));
const keyCapacity = computed(() => Math.max(1, Math.floor((keysWidth.value + KEY_GAP) / ((form.value === 'compact' ? COMPACT_KEY : KEY) + KEY_GAP))));
const keys = computed(() => {
  if (locks.value.length <= keyCapacity.value) return locks.value;
  const open = new Set(unlocked.value);
  return [...locks.value].sort((a, b) => Number(open.has(b)) - Number(open.has(a))).slice(0, keyCapacity.value - 1);
});
const hiddenKeys = computed(() => locks.value.length - keys.value.length);
const contactLooks = computed(
  () =>
    new Map(
      loose.value.map((contact) => {
        const online = contact.online.value;
        const look = {
          sensor: contact,
          icon: sensorIcon(contact.type, contact),
          name: contact.displayName.value,
          state: online ? sensorStatus(contact.type, contact, t) : t('connection.offline'),
          on: online && contact.getProperty(ContactProperty.Detected) === true,
          color: toneColor('warn'),
          offline: !online,
        };
        return [contact.id, look];
      }),
    ),
);
const lockAllButton = computed(() => ({
  class: 'home-locks__all',
  showLabel: true,
  icon: LockIcon,
  label: t('components.sensor_tile.lock'),
  'aria-label': t('views.home_dashboard.groups.locks.lock_all'),
  interactive: interactive.value,
}));

function setKeyNote(id: string, note: string | undefined) {
  keyNotes.delete(id);
  if (note) keyNotes.set(id, note);
}

function contactChip(contact: ReactiveSensor) {
  const { name, state, ...look } = contactLooks.value.get(contact.id)!;
  return { ...look, label: name, ariaLabel: `${name}: ${state}`, large: true };
}
</script>

<style scoped>
.home-locks__rows {
  align-self: stretch;
}

.home-locks__stack {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.home-locks__keys {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.home-locks__more {
  flex: none;
  aspect-ratio: 1;
  height: 3rem;
  border-radius: 1rem;
  background: var(--p-content-hover-background);
  color: var(--text-secondary-color);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}

.home-locks__more--compact {
  height: 2.5rem;
}

.home-locks .home-locks__pill {
  flex: none;
  height: 2.5rem;
}

.home-locks .home-locks__all {
  border-radius: 1rem;
}

.home-locks__list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
</style>
