<template>
  <CuiTileWidget
    ref="widgetRef"
    class="home-openings"
    :icon="WindowIcon"
    :title="name"
    :state="line"
    :summary="state"
    :color
    :active="open.length > 0"
    :offline
    :hero="state"
    hero-word
    extra-shows-hero
    @open="listRef?.toggle($event)"
  >
    <template v-if="canClose && form === 'compact' && !narrow" #actions>
      <CuiTileAction class="home-openings__key" :icon="GarageIcon" :label="closeLabel" @click="closeGarages" />
    </template>

    <template v-if="open.length && !narrow" #side>
      <span ref="sideRef" class="home-openings__side">
        <span v-for="item in sideItems" :key="item.sensor.id" class="home-openings__line">
          <span class="home-openings__name">{{ item.sensor.displayName.value }}</span>
          <span v-if="item.since" class="home-openings__when">· {{ t('views.home_dashboard.groups.openings.since', { time: duration(item.since) }) }}</span>
        </span>
        <span v-if="sideMore" class="home-openings__line">+{{ sideMore }}</span>
      </span>
    </template>

    <template #extra>
      <CuiHomePager class="home-openings__chips" :items :row-height="TALL_ROW_HEIGHT" :min-width="CHIP_WIDTH" :item-key="(item) => item.sensor.id">
        <template #default="{ item }">
          <CuiHomeChip v-bind="chipOf(item)" />
        </template>
      </CuiHomePager>
    </template>

    <CuiHomePager v-if="form === 'compact' && !narrow" :items :row-height="CHIP_HEIGHT" :min-width="CHIP_WIDTH" :item-key="(item) => item.sensor.id">
      <template #default="{ item }">
        <CuiHomeChip v-bind="chipOf(item)" />
      </template>
    </CuiHomePager>
    <CuiTileAction
      v-else-if="canClose"
      class="home-openings__close"
      show-label
      :icon="GarageIcon"
      :label="narrow ? t(`views.home_dashboard.groups.openings.${garages.length > 1 ? 'close_short_many' : 'close_short'}`) : closeLabel"
      :aria-label="closeLabel"
      @click="closeGarages"
    />
    <CuiHomeIconMatrix v-else-if="form === 'compact'" :items="matrixItems" :rows="matrixRows(compactSpace)" :label="matrixLabel" />
  </CuiTileWidget>

  <CuiPopoverSheet ref="listRef" v-slot="{ sheet }">
    <CuiHomeTileGrid v-if="sheet" :sensors="items.map((item) => item.sensor)" :disabled />
    <div v-else class="home-openings__list">
      <CuiHomeChip v-for="item in items" :key="item.sensor.id" v-bind="chipOf(item)" />
    </div>
  </CuiPopoverSheet>

  <CuiSensorTileSheet v-if="sheetSensor" ref="sheetRef" :sensor="sheetSensor" :disabled />
</template>

<script setup lang="ts">
import GarageIcon from '~icons/mdi/garage-variant';
import WindowIcon from '~icons/mdi/window-closed-variant';

import { toneColor } from '@/common/sensorDisplay.js';
import CuiPopoverSheet from '@/components/CuiPopoverSheet/CuiPopoverSheet.vue';
import CuiSensorTileSheet from '@/components/CuiSensorTile/CuiSensorTileSheet.vue';
import CuiTileAction from '@/components/CuiSensorTile/frame/CuiTileAction.vue';
import CuiTileWidget from '@/components/CuiSensorTile/frame/CuiTileWidget.vue';

import CuiHomePager from '../CuiHomePager.vue';
import CuiHomeTileGrid from '../CuiHomeTileGrid.vue';
import CuiHomeChip from './CuiHomeChip.vue';
import CuiHomeIconMatrix from './CuiHomeIconMatrix.vue';
import { useMemberSheet } from './memberSheet.js';
import { useOpeningGroup } from './openings.js';
import { matrixRows, useCompactSpace, useDuration } from './status.js';

import type { CuiHomeGroupDesignProps } from '../types.js';
import type { HomeOpening } from './openings.js';
import type { CuiHomeChipProps, HomeMatrixItem } from './status.js';

const props = defineProps<CuiHomeGroupDesignProps>();

const { t } = useI18n();
const { duration } = useDuration();

const { items, open, garages, closeGarages } = useOpeningGroup(() => props.sensors);

const CHIP_WIDTH = 120;
const CHIP_HEIGHT = 32;
const TALL_ROW_HEIGHT = 36;
const SIDE_LINE = 20;
const SIDE_PAD = 4;

const widgetRef = useTemplateRef<InstanceType<typeof CuiTileWidget>>('widgetRef');
const sideRef = useTemplateRef<HTMLSpanElement>('sideRef');
const listRef = useTemplateRef<InstanceType<typeof CuiPopoverSheet>>('listRef');
const sheetRef = useTemplateRef<InstanceType<typeof CuiSensorTileSheet>>('sheetRef');

const { sheetSensor } = useMemberSheet(sheetRef);

const widgetEl = computed(() => widgetRef.value?.$el as HTMLElement | undefined);
const compactSpace = useCompactSpace(widgetEl);
const { height: sideHeight } = useElementSize(sideRef);

const color = toneColor('warn');
const form = computed(() => widgetRef.value?.form ?? 'short');
const narrow = computed(() => widgetRef.value?.narrow ?? false);
const offline = computed(() => items.value.every((item) => !item.sensor.online.value));
const canClose = computed(() => !props.disabled && garages.value.length > 0);
const state = computed(() => {
  if (offline.value) return t('connection.offline');
  return open.value.length ? t('views.home_dashboard.groups.openings.open', { count: open.value.length }) : t('views.home_dashboard.groups.openings.all_closed');
});
const line = computed(() => {
  if (!open.value.length) return state.value;
  return t('views.home_dashboard.groups.openings.open_names', { count: open.value.length, names: open.value.map((item) => item.sensor.displayName.value).join(', ') });
});
const closeLabel = computed(() => t(`views.home_dashboard.groups.openings.${garages.value.length > 1 ? 'close_garages' : 'close_garage'}`));
const sideLines = computed(() => Math.max(1, Math.floor((sideHeight.value - SIDE_PAD) / SIDE_LINE)));
const sideItems = computed(() => (open.value.length > sideLines.value ? open.value.slice(0, sideLines.value - 1) : open.value));
const sideMore = computed(() => open.value.length - sideItems.value.length);
const matrixItems = computed<HomeMatrixItem[]>(() => items.value.map((item) => ({ key: item.sensor.id, icon: item.icon, on: item.open, color })));
const matrixLabel = computed(() => t('views.home_dashboard.groups.openings.open_count', { open: open.value.length, count: items.value.length }));

function chipOf(item: HomeOpening): CuiHomeChipProps {
  const name = item.sensor.displayName.value;
  const time = item.since ? duration(item.since) : undefined;
  let aria = t('views.home_dashboard.groups.openings.member_closed', { name });
  if (item.open)
    aria = time ? t('views.home_dashboard.groups.openings.member_open', { name, time }) : t('views.home_dashboard.groups.openings.member_open_now', { name });
  return {
    sensor: item.sensor,
    label: name,
    detail: item.open ? time : undefined,
    icon: item.icon,
    on: item.open,
    color,
    ariaLabel: aria,
    offline: !item.sensor.online.value,
  };
}
</script>

<style scoped>
.home-openings__chips {
  align-self: stretch;
}

.home-openings__side {
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

.home-openings__line {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-content: flex-start;
  column-gap: 0.25rem;
  max-width: 100%;
  height: 1.125rem;
  line-height: 1.125rem;
  overflow: hidden;
}

.home-openings__name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-openings__when {
  flex: none;
  white-space: nowrap;
}

.home-openings .home-openings__key {
  flex: none;
  width: 2.5rem;
  height: 2.5rem;
}

.home-openings .home-openings__close {
  border-radius: 1rem;
}

.home-openings__list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.375rem;
}
</style>
