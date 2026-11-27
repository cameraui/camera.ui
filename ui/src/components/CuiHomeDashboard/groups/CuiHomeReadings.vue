<template>
  <CuiTileWidget
    ref="widgetRef"
    class="home-readings"
    :icon="ThermometerIcon"
    :title="name"
    :state="narrow ? narrowLine : line"
    :summary
    :color
    :active="alerting"
    :offline
    :hero
    :hero-note="single && narrow ? values[1]?.text : undefined"
    :extra-shows-hero="!single"
    @open="open"
  >
    <template v-if="single && !narrow && values.length > 1" #side>
      <span class="home-readings__side">
        <button v-for="value in values.slice(1, 3)" :key="value.sensor.id" type="button" class="home-readings__secondary" @click="openMember(value.sensor, $event)">
          <CuiHomeReadingValue class="home-readings__secondary-value" :value short />
          <span class="home-readings__secondary-label">{{ value.caption }}</span>
        </button>
      </span>
    </template>

    <template v-if="!single" #extra>
      <CuiHomePager class="home-readings__places" :items="places" :row-height="CELL.height" :min-width="CELL.width" :item-key="(place) => place.key">
        <template #default="{ item }">
          <CuiHomeValueCell big :name="item.label" :value="item.values[0].text" @click="openMember(item.values[0].sensor, $event)">
            <template v-for="(value, index) in item.values.slice(1)" :key="value.sensor.id"> {{ index ? ' · ' : '' }}<CuiHomeReadingValue :value /> </template>
          </CuiHomeValueCell>
        </template>
      </CuiHomePager>
    </template>
    <template v-else-if="values[0]?.format" #extra>
      <CuiMeasurementTrend class="home-readings__trend" bare caption fill :sensor="values[0].sensor" :property="values[0].property" :format="values[0].format" />
    </template>

    <template #default="{ form }">
      <div v-if="form === 'compact' && single" class="home-readings__values">
        <button
          v-for="value in values.slice(0, narrow ? 2 : 3)"
          :key="value.sensor.id"
          type="button"
          class="home-readings__value"
          @click="openMember(value.sensor, $event)"
        >
          {{ value.text }}
        </button>
      </div>
      <div v-else-if="form === 'compact' && narrow" class="home-readings__values">
        <span v-for="text in ranges" :key="text">{{ text }}</span>
      </div>
      <CuiHomePager
        v-else-if="!single && !narrow && form !== 'tall'"
        class="home-readings__places home-readings__places--rows"
        :items="places"
        :row-height="ROW_HEIGHT"
        :min-width="inner >= TWO_COLUMNS_FROM ? ROW_WIDTH : inner"
        :item-key="(place) => place.key"
      >
        <template #default="{ item }">
          <button type="button" class="home-readings__row" @click="openMember(item.values[0].sensor, $event)">
            <span class="home-readings__name"> <span v-if="item.issue" class="home-readings__dot" :style="{ background: item.issue.color }" />{{ item.label }} </span>
            <CuiHomeReadingValue class="home-readings__first" :value="item.values[0]" />
            <CuiHomeReadingValue v-if="item.values[1]" class="home-readings__second" :value="item.values[1]" />
          </button>
        </template>
      </CuiHomePager>
    </template>
  </CuiTileWidget>

  <CuiPopoverSheet ref="listRef">
    <div class="home-readings__list">
      <CuiHomeValueCell
        v-for="place in places"
        :key="place.key"
        big
        :name="place.label"
        :value="place.values[0].text"
        @click="openMember(place.values[0].sensor, $event)"
      >
        <template v-for="(value, index) in place.values.slice(1)" :key="value.sensor.id"> {{ index ? ' · ' : '' }}<CuiHomeReadingValue :value /> </template>
      </CuiHomeValueCell>
    </div>
  </CuiPopoverSheet>

  <CuiSensorTileSheet v-if="sheetSensor" ref="sheetRef" :sensor="sheetSensor" :disabled />
</template>

<script setup lang="ts">
import { SensorType } from '@camera.ui/sdk';

import { sensorTypeIcon } from '@/common/sensorDisplay.js';
import CuiPopoverSheet from '@/components/CuiPopoverSheet/CuiPopoverSheet.vue';
import CuiSensorTileSheet from '@/components/CuiSensorTile/CuiSensorTileSheet.vue';
import CuiTileWidget from '@/components/CuiSensorTile/frame/CuiTileWidget.vue';
import CuiMeasurementTrend from '@/components/CuiSensorTile/measurement/CuiMeasurementTrend.vue';

import CuiHomePager from '../CuiHomePager.vue';
import CuiHomeReadingValue from './CuiHomeReadingValue.vue';
import CuiHomeValueCell from './CuiHomeValueCell.vue';
import { useMemberSheet } from './memberSheet.js';
import { useReadingsGroup } from './readings.js';

import type { CuiHomeGroupDesignProps } from '../types.js';

const props = defineProps<CuiHomeGroupDesignProps>();

const { places, single, values, offline, alerting, color, temperatureRange, humidityRange, line, narrowLine, summary } = useReadingsGroup(
  () => props.sensors,
  () => props.name,
);

const ThermometerIcon = sensorTypeIcon(SensorType.Temperature);
const CELL = { width: 110, height: 92 };
const ROW_WIDTH = 150;
const ROW_HEIGHT = 30;
const TWO_COLUMNS_FROM = 380;
const CARD_PADDING = 32;

const widgetRef = useTemplateRef<InstanceType<typeof CuiTileWidget>>('widgetRef');
const listRef = useTemplateRef<InstanceType<typeof CuiPopoverSheet>>('listRef');
const sheetRef = useTemplateRef<InstanceType<typeof CuiSensorTileSheet>>('sheetRef');

const { sheetSensor, openMember } = useMemberSheet(sheetRef);

const widgetEl = computed(() => widgetRef.value?.$el as HTMLElement | undefined);
const { width } = useElementSize(widgetEl, undefined, { box: 'border-box' });

const narrow = computed(() => widgetRef.value?.narrow ?? false);
const inner = computed(() => width.value - CARD_PADDING);
const hero = computed(() => {
  if (single.value) return values.value[0]?.text ?? '–';
  return narrow.value ? (temperatureRange.value ?? humidityRange.value ?? '–') : undefined;
});
const ranges = computed(() => [temperatureRange.value, humidityRange.value].filter((text) => text !== undefined));

function open(event: Event) {
  if (!single.value) listRef.value?.toggle(event);
  else if (values.value[0]) openMember(values.value[0].sensor, event);
}
</script>

<style scoped>
.home-readings :deep(.tile-widget__body:empty) {
  display: none;
}

.home-readings.tile-widget--compact :deep(.tile-widget__body) {
  flex: 1 1 auto;
  justify-content: flex-end;
  min-height: 0;
}

.home-readings__places {
  flex: 1 1 auto;
  align-self: stretch;
  justify-content: center;
  min-height: 0;
}

.home-readings__places--rows {
  justify-content: flex-end;
}

.home-readings__trend {
  --tile-color: var(--text-secondary-color);
  align-self: stretch;
}

.home-readings__side {
  display: flex;
  flex: none;
  gap: 1rem;
  padding-bottom: 0.25rem;
}

.home-readings__secondary {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  border-radius: 0.5rem;
  cursor: pointer;
}

.home-readings__value {
  border-radius: 0.375rem;
  cursor: pointer;
}

.home-readings__secondary:focus-visible,
.home-readings__value:focus-visible,
.home-readings__row:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.home-readings__secondary-value {
  font-size: 1.375rem;
  font-weight: 300;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.home-readings__secondary-label {
  font-size: 0.75rem;
  color: var(--text-secondary-color);
}

.home-readings__values {
  display: flex;
  flex-wrap: wrap;
  gap: 0.125rem 0.875rem;
  font-size: 1.25rem;
  font-weight: 300;
  line-height: 1.2;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.home-readings__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(2.5rem, auto);
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  height: 1.875rem;
  padding: 0 0.625rem;
  border-radius: 0.625rem;
  background: var(--p-content-hover-background);
  font-size: 0.8125rem;
  text-align: left;
  cursor: pointer;
}

.home-readings__name {
  min-width: 0;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-readings__dot {
  display: inline-block;
  width: 0.4375rem;
  height: 0.4375rem;
  margin-right: 0.375rem;
  border-radius: 50%;
  vertical-align: 1px;
}

.home-readings__first {
  font-size: 1rem;
}

.home-readings__second {
  text-align: right;
  color: var(--text-secondary-color);
}

.home-readings__list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.375rem;
}
</style>
