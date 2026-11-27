<template>
  <CuiTileWidget
    ref="widgetRef"
    class="home-valves"
    :icon
    :title="name"
    :state="hint ? holdText : line"
    :summary="hint ? holdText : summary"
    :color
    :active="running.length > 0"
    :offline
    :hero
    :hero-note="left && !narrow ? t('views.home_dashboard.groups.valves.remaining') : undefined"
    extra-shows-hero
    @open="listRef?.toggle($event)"
  >
    <template v-if="canStopAll && (!narrow || form === 'tall')" #actions>
      <CuiTileAction class="home-valves__stop-all" :icon="StopIcon" :label="t('views.home_dashboard.groups.valves.stop_all')" :interactive @click="stopAll" />
    </template>

    <template #extra>
      <CuiHomePager ref="rowsRef" class="home-valves__rows" :items="zones" :row-height="ROW_HEIGHT" :min-width="ROW_WIDTH" :item-key="(zone) => zone.sensor.id">
        <template #default="{ item }">
          <CuiHomeValveRow :zone="item" :lead="rowLead" :disabled @toggle="toggle(item)" @hint="hint = $event" />
        </template>
      </CuiHomePager>
    </template>

    <template v-if="form === 'tall'">
      <div v-if="timed.length && !disabled" class="home-valves__durations">
        <span v-if="!narrow" class="home-valves__unit">{{ t('views.home_dashboard.groups.valves.minutes') }}</span>
        <div class="home-valves__choices" role="group" :aria-label="t('views.home_dashboard.groups.valves.duration_all')">
          <button
            v-for="option in durations"
            :key="option"
            type="button"
            class="home-valves__choice"
            :class="{ 'home-valves__choice--selected': option === minutes }"
            :aria-pressed="option === minutes"
            :disabled="!interactive"
            @click="chooseMinutes(option)"
          >
            {{ option }}
          </button>
        </div>
      </div>
    </template>
    <CuiTileAction
      v-else-if="narrow && canStopAll"
      class="home-valves__stop"
      show-label
      :icon="form === 'compact' ? undefined : StopIcon"
      :label="t('views.home_dashboard.groups.valves.stop')"
      :aria-label="t('views.home_dashboard.groups.valves.stop_all')"
      :interactive
      @click="stopAll"
    />
    <CuiHomeIconMatrix v-else-if="narrow" :items="matrixItems" :rows="form === 'compact' ? matrixRows(compactSpace) : 1" :label="line" />
    <CuiHomePager
      v-else
      class="home-valves__chips"
      :style="form === 'short' ? { height: `${chipsHeight}px` } : undefined"
      :items="zones"
      :row-height="CHIP_HEIGHT"
      :min-width="CHIP_WIDTH"
      :item-key="(zone) => zone.sensor.id"
    >
      <template #default="{ item }">
        <CuiHomeChip v-bind="chipOf(item, form === 'compact')" @press="toggle(item)" @hint="hint = $event" />
      </template>
    </CuiHomePager>
  </CuiTileWidget>

  <CuiPopoverSheet ref="listRef">
    <div class="home-valves__list">
      <CuiHomeValveRow v-for="zone in zones" :key="zone.sensor.id" :zone lead :disabled @toggle="toggle(zone)" @hint="hint = $event" />
    </div>
  </CuiPopoverSheet>

  <CuiSensorTileSheet v-if="sheetSensor" ref="sheetRef" :sensor="sheetSensor" :disabled />
</template>

<script setup lang="ts">
import { SensorType } from '@camera.ui/sdk';
import StopIcon from '~icons/lucide/square';

import { sensorIcon, sensorTypeIcon } from '@/common/sensorDisplay.js';
import CuiPopoverSheet from '@/components/CuiPopoverSheet/CuiPopoverSheet.vue';
import CuiSensorTileSheet from '@/components/CuiSensorTile/CuiSensorTileSheet.vue';
import CuiTileAction from '@/components/CuiSensorTile/frame/CuiTileAction.vue';
import CuiTileWidget from '@/components/CuiSensorTile/frame/CuiTileWidget.vue';
import { clock } from '@/components/CuiSensorTile/valve/useValve.js';

import CuiHomePager from '../CuiHomePager.vue';
import CuiHomeChip from './CuiHomeChip.vue';
import CuiHomeIconMatrix from './CuiHomeIconMatrix.vue';
import CuiHomeValveRow from './CuiHomeValveRow.vue';
import { useMemberSheet } from './memberSheet.js';
import { matrixRows, useCompactSpace } from './status.js';
import { useValveGroup } from './valves.js';

import type { ComponentPublicInstance } from 'vue';
import type { CuiHomeGroupDesignProps } from '../types.js';
import type { CuiHomeChipProps, HomeMatrixItem } from './status.js';
import type { HomeValveZone } from './valves.js';

const props = defineProps<CuiHomeGroupDesignProps>();

const { t } = useI18n();

const CHIP_WIDTH = 120;
const CHIP_HEIGHT = 32;
const ROW_WIDTH = 190;
const ROW_HEIGHT = 48;
const LEAD_WIDTH = 240;
const DOTS_HEIGHT = 14;
const PAGER_GAP = 6;
const PAD = 16;
const SHORT_CHROME = 2 * PAD + 40 + 12 + 48 + 12;

const widgetRef = useTemplateRef<InstanceType<typeof CuiTileWidget>>('widgetRef');
const rowsRef = useTemplateRef<ComponentPublicInstance>('rowsRef');
const listRef = useTemplateRef<InstanceType<typeof CuiPopoverSheet>>('listRef');
const sheetRef = useTemplateRef<InstanceType<typeof CuiSensorTileSheet>>('sheetRef');
const hint = ref(false);

const { sheetSensor } = useMemberSheet(sheetRef);

const members = computed(() => props.sensors.filter((sensor) => sensor.type !== SensorType.Battery));
const { zones, running, left, color, timed, durations, minutes, line, toggle, stopAll, chooseMinutes } = useValveGroup(() => members.value);

const widgetEl = computed(() => widgetRef.value?.$el as HTMLElement | undefined);
const rowsEl = computed(() => rowsRef.value?.$el as HTMLElement | undefined);
const compactSpace = useCompactSpace(widgetEl);
const { width: cardWidth, height: cardHeight } = useElementSize(widgetEl, undefined, { box: 'border-box' });
const { width: rowsWidth } = useElementSize(rowsEl);

const offline = computed(() => members.value.every((member) => !member.online.value));
const interactive = computed(() => !props.disabled && !offline.value);
const canStopAll = computed(() => !props.disabled && running.value.length > 0);
const form = computed(() => widgetRef.value?.form ?? 'short');
const narrow = computed(() => widgetRef.value?.narrow ?? false);
const holdText = computed(() => t('components.sensor_tile.hold_to_open'));
const icon = computed(() => {
  const lead = running.value[0]?.sensor ?? members.value[0];
  return lead ? sensorIcon(SensorType.Valve, lead) : sensorTypeIcon(SensorType.Valve);
});
const hero = computed(() => {
  if (!running.value.length) return t('components.sensor_state.off');
  return left.value ? clock(left.value) : t('components.sensor_state.on');
});
const summary = computed(() => {
  if (!running.value.length) return line.value;
  return left.value ? t('views.home_dashboard.groups.valves.left', { time: clock(left.value) }) : line.value;
});
const matrixItems = computed<HomeMatrixItem[]>(() =>
  zones.value.map((zone) => ({ key: zone.sensor.id, icon: sensorIcon(SensorType.Valve, zone.sensor), on: zone.running, color: zone.color })),
);
const rowLead = computed(() => {
  const columns = Math.max(1, Math.floor((rowsWidth.value + PAGER_GAP) / (ROW_WIDTH + PAGER_GAP)));
  return (rowsWidth.value - (columns - 1) * PAGER_GAP) / columns >= LEAD_WIDTH;
});

const chipsHeight = computed(() => {
  const columns = Math.max(1, Math.floor((cardWidth.value - 2 * PAD + PAGER_GAP) / (CHIP_WIDTH + PAGER_GAP)));
  const fit = Math.floor((cardHeight.value - SHORT_CHROME - DOTS_HEIGHT + PAGER_GAP) / (CHIP_HEIGHT + PAGER_GAP));
  const rows = Math.max(1, Math.min(fit, Math.ceil(zones.value.length / columns)));
  return rows * (CHIP_HEIGHT + PAGER_GAP) - PAGER_GAP + DOTS_HEIGHT;
});

function chipOf(zone: HomeValveZone, compact: boolean): CuiHomeChipProps {
  const name = zone.label;
  const time = zone.remaining ? clock(zone.remaining) : undefined;
  let ariaLabel: string;
  if (zone.running) ariaLabel = time ? t('views.home_dashboard.groups.valves.stop_left', { name, time }) : t('views.home_dashboard.groups.valves.stop_name', { name });
  else
    ariaLabel = zone.minutes
      ? t('views.home_dashboard.groups.valves.start_for', { name, count: zone.minutes })
      : t('views.home_dashboard.groups.valves.start_name', { name });
  return {
    sensor: zone.sensor,
    label: name,
    detail: compact ? time : undefined,
    icon: sensorIcon(SensorType.Valve, zone.sensor),
    on: zone.running,
    color: zone.color,
    ariaLabel,
    offline: !zone.sensor.online.value,
    pressable: true,
    guarded: zone.gas && !zone.running,
    interactive: interactive.value && zone.sensor.online.value,
  };
}
</script>

<style scoped>
.home-valves :deep(.tile-widget__body:empty) {
  display: none;
}

.home-valves.tile-widget--compact :deep(.tile-widget__body) {
  flex: 1 1 auto;
  justify-content: flex-end;
  min-height: 0;
}

.home-valves__stop-all {
  flex: none;
  width: 2.5rem;
  height: 2.5rem;
}

.home-valves__rows {
  align-self: stretch;
  justify-content: center;
}

.home-valves__chips {
  flex: none;
  justify-content: flex-end;
}

.tile-widget--compact .home-valves__chips {
  flex: 1 1 auto;
  min-height: 0;
}

.home-valves .home-valves__stop {
  flex: 1 1 auto;
  width: 100%;
  border-radius: 1rem;
}

.home-valves__durations {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.home-valves__unit {
  flex: none;
  font-size: 0.8125rem;
  color: var(--text-secondary-color);
}

.home-valves__choices {
  display: flex;
  flex: 1 1 auto;
  gap: 0.25rem;
  min-width: 0;
  height: 2.5rem;
  padding: 0.25rem;
  border-radius: 9999px;
  background: var(--p-content-hover-background);
}

.home-valves__choice {
  flex: 1 1 0;
  min-width: 0;
  border-radius: 9999px;
  color: var(--text-secondary-color);
  font-size: 0.8125rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease;
}

.home-valves__choice--selected {
  background: var(--text-color);
  color: var(--p-content-background);
}

.home-valves__choice:disabled {
  cursor: default;
}

.home-valves__choice:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.home-valves__list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
</style>
