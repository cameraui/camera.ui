<template>
  <CuiTileWidget
    ref="widgetRef"
    class="home-alarm"
    :icon
    :title
    :state="hintText ?? line"
    :note
    :summary="hintText ?? summary"
    :color
    :active
    :offline
    :hero
    :hero-note="heroNote"
    hero-word
    :hero-toned="heroToned"
    :extra-shows-hero="extraRows.length > 0 && !alarmed"
    @open="listRef?.toggle($event)"
  >
    <template v-if="extraRows.length" #extra>
      <CuiHomePager class="home-alarm__rows" :items="extraRows" :row-height="ROW_HEIGHT" :min-width="ROW_WIDTH" :item-key="(row) => row.key">
        <template #default="{ item }">
          <CuiHomeAlarmRow :row="item" :narrow :interactive @hint="showHint('sound', $event)" />
        </template>
      </CuiHomePager>
    </template>

    <div v-if="!disabled && panel && !alarmed" class="home-alarm__modes">
      <CuiTileHoldAction
        :icon="DisarmIcon"
        :label="armed ? t('views.home_dashboard.groups.alarm.disarm_hold') : t('components.sensor_tile.disarm')"
        :color="MUTED"
        :active="!armed"
        :guarded="armed"
        :interactive="canArm"
        :waiting="waiting && !armed"
        :failed="failed && !armed"
        @press="disarm"
        @hint="showHint('disarm', $event)"
      />
      <CuiTileAction
        v-for="value in armModes"
        :key="value"
        :icon="securityModeIcon(value)"
        :label="t('views.home_dashboard.groups.alarm.arm', { mode: modeLabel(value) })"
        :color="securityColor(value)"
        :active="mode === value"
        :interactive="canArm"
        :waiting="waiting && mode === value"
        :failed="failed && mode === value"
        @click="arm(value)"
      />
    </div>
    <CuiTileHoldAction
      v-else-if="!disabled && panel"
      class="home-alarm__main"
      show-label
      :icon="tight ? undefined : DisarmIcon"
      :label="t('components.sensor_tile.disarm')"
      :aria-label="t('views.home_dashboard.groups.alarm.disarm_hold')"
      guarded
      :interactive="canArm"
      :waiting
      :failed
      @press="disarm"
      @hint="showHint('disarm', $event)"
    />
    <CuiTileHoldAction
      v-else-if="!disabled"
      class="home-alarm__main"
      show-label
      :icon="tight ? undefined : sirenAction.icon"
      :label="sirensLabel"
      :aria-label="sirenAction.ariaLabel"
      :guarded="sirenAction.guarded"
      :interactive="interactive && sirenAction.ready"
      @press="sirenAction.press"
      @hint="showHint('sound', $event)"
    />
  </CuiTileWidget>

  <CuiPopoverSheet ref="listRef" width="18rem">
    <div class="home-alarm__list">
      <CuiHomeAlarmRow v-for="row in memberRows" :key="row.key" :row :narrow="false" :interactive @hint="showHint('sound', $event)" />
    </div>
  </CuiPopoverSheet>

  <CuiSensorTileSheet v-if="sheetSensor" ref="sheetRef" :sensor="sheetSensor" :disabled />
</template>

<script setup lang="ts">
import { SensorType } from '@camera.ui/sdk';
import DisarmIcon from '~icons/mdi/shield-off-outline';

import { securityColor, sensorIcon, sensorTypeIcon } from '@/common/sensorDisplay.js';
import CuiPopoverSheet from '@/components/CuiPopoverSheet/CuiPopoverSheet.vue';
import { securityModeIcon } from '@/components/CuiSensorTile/alarm/modes.js';
import CuiSensorTileSheet from '@/components/CuiSensorTile/CuiSensorTileSheet.vue';
import CuiTileAction from '@/components/CuiSensorTile/frame/CuiTileAction.vue';
import CuiTileHoldAction from '@/components/CuiSensorTile/frame/CuiTileHoldAction.vue';
import CuiTileWidget from '@/components/CuiSensorTile/frame/CuiTileWidget.vue';
import { useTileWait } from '@/components/CuiSensorTile/useTileWait.js';

import CuiHomePager from '../CuiHomePager.vue';
import { useAlarmGroup } from './alarm.js';
import CuiHomeAlarmRow from './CuiHomeAlarmRow.vue';
import { useMemberSheet } from './memberSheet.js';

import type { CuiHomeGroupDesignProps } from '../types.js';

const props = defineProps<CuiHomeGroupDesignProps>();

const { t } = useI18n();

const {
  panel,
  ready,
  sirens,
  contacts,
  sounding,
  opened,
  mode,
  alarmed,
  armed,
  pending,
  armModes,
  color,
  cause,
  openText,
  sinceText,
  sirenText,
  sirenAction,
  sirensRow,
  sirenRows,
  watchRows,
  memberRows,
  modeLabel,
  arm,
  disarm,
} = useAlarmGroup(() => props.sensors);
const { waiting, failed, note } = useTileWait(() => panel.value);

const ROW_WIDTH = 260;
const ROW_HEIGHT = 44;
const MUTED = 'var(--text-secondary-color)';

const widgetRef = useTemplateRef<InstanceType<typeof CuiTileWidget>>('widgetRef');
const listRef = useTemplateRef<InstanceType<typeof CuiPopoverSheet>>('listRef');
const sheetRef = useTemplateRef<InstanceType<typeof CuiSensorTileSheet>>('sheetRef');
const hint = ref<'disarm' | 'sound'>();

const { sheetSensor } = useMemberSheet(sheetRef);

const form = computed(() => widgetRef.value?.form ?? 'short');
const narrow = computed(() => widgetRef.value?.narrow ?? false);
const tight = computed(() => form.value === 'compact' && narrow.value);
const offline = computed(() => props.sensors.filter((sensor) => sensor.type !== SensorType.Battery).every((sensor) => !sensor.online.value));
const interactive = computed(() => !props.disabled);
const canArm = computed(() => interactive.value && ready.value.length > 0);
const panelOnline = computed(() => !!panel.value?.online.value);
const title = computed(() => (!panel.value && props.name === t('views.home_dashboard.groups.alarm.title') ? t('views.home_dashboard.groups.alarm.sirens') : props.name));
const hintText = computed(() => hint.value && t(`components.sensor_tile.${hint.value === 'disarm' ? 'hold_to_disarm' : 'hold_to_sound'}`));
const icon = computed(() => {
  if (!panel.value) return sensorTypeIcon(SensorType.Siren, sounding.value.length > 0);
  const shown = alarmed.value ?? panel.value;
  return sensorIcon(shown.type, shown);
});
const active = computed(() => (panel.value ? !!alarmed.value || armed.value : sounding.value.length > 0));
const soundingCount = computed(() => t('views.home_dashboard.groups.alarm.count_on', { count: sounding.value.length }));
const line = computed(() => {
  if (!panel.value)
    return sounding.value.length ? sirenText.value : t('views.home_dashboard.groups.alarm.sirens_all_off', { count: sirens.value.length }, sirens.value.length);
  if (!panelOnline.value) return t('connection.offline');
  if (alarmed.value) return cause.value ? t('views.home_dashboard.groups.alarm.triggered_by', { cause: cause.value }) : t('views.home_dashboard.groups.alarm.triggered');
  if (pending.value) return t(`components.sensor_tile.${armed.value ? 'arming' : 'disarming'}`);
  return !armed.value && contacts.value.length ? openText.value : sinceText.value;
});
const summary = computed(() => {
  if (!panel.value) return sounding.value.length ? soundingCount.value : t('views.home_dashboard.groups.alarm.all_off');
  if (!panelOnline.value) return t('connection.offline');
  if (alarmed.value) return t('views.home_dashboard.groups.alarm.triggered');
  return !armed.value && opened.value.length ? openText.value : modeLabel(mode.value);
});
const hero = computed(() => {
  if (!panel.value) {
    if (sounding.value.length === 1) return sounding.value[0].displayName.value;
    return sounding.value.length ? soundingCount.value : t('views.home_dashboard.groups.alarm.all_off');
  }
  if (alarmed.value) return t('views.home_dashboard.groups.alarm.hero_triggered');
  return panelOnline.value ? modeLabel(mode.value) : t('connection.offline');
});
const heroNote = computed(() => {
  if (narrow.value) return undefined;
  if (panel.value) return alarmed.value ? cause.value : undefined;
  return sounding.value.length === 1 ? t('views.home_dashboard.groups.alarm.note_on') : undefined;
});
const heroToned = computed(() => (panel.value ? !!alarmed.value : sounding.value.length > 0));
const sirensLabel = computed(() => {
  const key = sounding.value.length ? 'silence' : 'sound';
  return narrow.value ? t(`components.sensor_tile.${key}`) : t(`views.home_dashboard.groups.alarm.${key}_all`);
});
const extraRows = computed(() => (panel.value ? [...(sirens.value.length ? [sirensRow.value] : []), ...watchRows.value] : [...sirenRows.value, ...watchRows.value]));

function showHint(kind: 'disarm' | 'sound', shown: boolean) {
  hint.value = shown ? kind : undefined;
}
</script>

<style scoped>
.home-alarm__rows {
  align-self: stretch;
}

.home-alarm__modes {
  display: flex;
  gap: 0.5rem;
}

.home-alarm .home-alarm__main {
  border-radius: 1rem;
}

.home-alarm__list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
</style>
