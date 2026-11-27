<template>
  <CuiTileWidget
    ref="widgetRef"
    class="home-states"
    :icon="StatesIcon"
    :title="name"
    :state="line"
    :summary="state"
    :color
    :active="active.length > 0"
    :offline
    :hero="state"
    hero-word
    extra-shows-hero
    @open="listRef?.toggle($event)"
  >
    <template v-if="active.length && !narrow" #side>
      <span class="home-states__side">
        <span v-for="item in sideItems" :key="item.sensor.id" class="cui-tile home-states__line" :style="{ '--tile-color': item.color }">{{ sideLine(item) }}</span>
        <span v-if="sideMore" class="home-states__line">+{{ sideMore }}</span>
      </span>
    </template>

    <template #extra>
      <CuiHomePager class="home-states__chips" :items :row-height="CHIP_HEIGHT" :min-width="TALL_CHIP_WIDTH" :item-key="(item) => item.sensor.id">
        <template #default="{ item }">
          <CuiHomeChip v-bind="chipOf(item)" />
        </template>
      </CuiHomePager>
    </template>

    <CuiHomePager
      v-if="form === 'compact' && !narrow"
      :style="{ height: `${compactSpace}px` }"
      :items
      :row-height="CHIP_HEIGHT"
      :min-width="CHIP_WIDTH"
      :item-key="(item) => item.sensor.id"
    >
      <template #default="{ item }">
        <CuiHomeChip v-bind="chipOf(item)" />
      </template>
    </CuiHomePager>
    <CuiHomeIconMatrix v-else-if="narrow && form !== 'tall'" :items="matrixItems" :rows="form === 'compact' ? matrixRows(compactSpace) : 1" :label="line" />
  </CuiTileWidget>

  <CuiPopoverSheet ref="listRef">
    <div class="home-states__list">
      <CuiHomeStatusRow
        v-for="item in items"
        :key="item.sensor.id"
        :sensor="item.sensor"
        :icon="item.icon"
        :name="item.name"
        :state="rowState(item)"
        :on="item.active"
        :color="item.color"
        :offline="item.offline"
      />
    </div>
  </CuiPopoverSheet>

  <CuiSensorTileSheet v-if="sheetSensor" ref="sheetRef" :sensor="sheetSensor" :disabled />
</template>

<script setup lang="ts">
import StatesIcon from '~icons/mdi/pulse';

import CuiPopoverSheet from '@/components/CuiPopoverSheet/CuiPopoverSheet.vue';
import CuiSensorTileSheet from '@/components/CuiSensorTile/CuiSensorTileSheet.vue';
import CuiTileWidget from '@/components/CuiSensorTile/frame/CuiTileWidget.vue';

import CuiHomePager from '../CuiHomePager.vue';
import CuiHomeChip from './CuiHomeChip.vue';
import CuiHomeIconMatrix from './CuiHomeIconMatrix.vue';
import CuiHomeStatusRow from './CuiHomeStatusRow.vue';
import { useMemberSheet } from './memberSheet.js';
import { useStateGroup } from './states.js';
import { matrixRows, useCompactSpace, useDuration } from './status.js';

import type { CuiHomeGroupDesignProps } from '../types.js';
import type { HomeState } from './states.js';
import type { CuiHomeChipProps, HomeMatrixItem } from './status.js';

const props = defineProps<CuiHomeGroupDesignProps>();

const { t } = useI18n();
const { duration } = useDuration();

const { items, active, offline, color } = useStateGroup(() => props.sensors);

const CHIP_WIDTH = 140;
const TALL_CHIP_WIDTH = 200;
const CHIP_HEIGHT = 36;
const SIDE_ITEMS = 2;

const widgetRef = useTemplateRef<InstanceType<typeof CuiTileWidget>>('widgetRef');
const listRef = useTemplateRef<InstanceType<typeof CuiPopoverSheet>>('listRef');
const sheetRef = useTemplateRef<InstanceType<typeof CuiSensorTileSheet>>('sheetRef');

const { sheetSensor } = useMemberSheet(sheetRef);

const widgetEl = computed(() => widgetRef.value?.$el as HTMLElement | undefined);
const compactSpace = useCompactSpace(widgetEl);

const form = computed(() => widgetRef.value?.form ?? 'short');
const narrow = computed(() => widgetRef.value?.narrow ?? false);
const state = computed(() => {
  if (offline.value) return t('connection.offline');
  return active.value.length ? t('views.home_dashboard.groups.states.active', { count: active.value.length }) : t('views.home_dashboard.groups.states.calm');
});
const line = computed(() => {
  if (offline.value || !active.value.length) return state.value;
  return active.value.map((item) => t('views.home_dashboard.groups.states.member', { name: item.name, state: item.word })).join(', ');
});
const sideItems = computed(() => active.value.slice(0, SIDE_ITEMS));
const sideMore = computed(() => active.value.length - sideItems.value.length);
const matrixItems = computed<HomeMatrixItem[]>(() => items.value.map((item) => ({ key: item.sensor.id, icon: item.icon, on: item.active, color: item.color })));

function sideLine(item: HomeState): string {
  return item.since ? `${item.name} · ${duration(item.since)}` : item.name;
}

function rowState(item: HomeState): string {
  return item.since ? t('views.home_dashboard.groups.states.state_since', { state: item.word, time: duration(item.since) }) : item.word;
}

function chipOf(item: HomeState): CuiHomeChipProps {
  const time = item.since ? duration(item.since) : undefined;
  return {
    sensor: item.sensor,
    label: item.name,
    detail: time,
    icon: item.icon,
    on: item.active,
    color: item.color,
    large: true,
    offline: item.offline,
    ariaLabel: t('views.home_dashboard.groups.states.member', { name: item.name, state: rowState(item) }),
  };
}
</script>

<style scoped>
.home-states :deep(.tile-widget__body:empty) {
  display: none;
}

.home-states__chips {
  align-self: stretch;
}

.home-states__side {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: flex-end;
  align-self: stretch;
  gap: 0.125rem;
  flex-shrink: 0;
  max-width: 55%;
  min-height: 0;
  padding-bottom: 0.375rem;
  overflow: hidden;
  font-size: 0.8125rem;
  color: var(--tile-ink);
}

.home-states__line {
  max-width: 100%;
  line-height: 1.125rem;
  color: var(--tile-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-states__list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
</style>
