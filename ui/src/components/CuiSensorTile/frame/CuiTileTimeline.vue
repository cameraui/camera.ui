<template>
  <div class="timeline">
    <CuiTileHistoryHead :sensor :label="t('components.sensor_tile.last_day')" />
    <div class="timeline__track" v-on="listeners">
      <span v-for="(segment, index) in segments" :key="index" class="timeline__segment" :style="segment" />
    </div>
    <div class="timeline__axis">
      <span>{{ shortMoment(now - DAY, now, locale) }}</span>
      <span>{{ t('components.sensor_tile.now') }}</span>
    </div>

    <CuiChartTooltip :anchor :title="tip?.title" :rows="tip?.rows" />
  </div>
</template>

<script setup lang="ts">
import { sensorPropertySpec, sensorValueLabel } from '@/common/sensorDisplay.js';
import { buildHistorySeries } from '@/components/CuiDialog/templates/SensorHistory/history.js';
import { usePointerTooltip } from '@/composables/usePointerTooltip.js';

import { DAY, shortMoment } from '../useSensorHistory.js';
import CuiTileHistoryHead from './CuiTileHistoryHead.vue';
import { SEGMENT_ACTIVE } from './segments.js';

import type { HistorySegment } from '@/components/CuiDialog/templates/SensorHistory/history.js';
import type { PointerTooltipHit } from '@/composables/usePointerTooltip.js';
import type { CuiTileTimelineProps } from './types.js';

const props = defineProps<CuiTileTimelineProps>();

const { t, locale } = useI18n();

const history = computed(() => {
  const series = buildHistorySeries(props.entries, props.now - DAY, props.now, (property) => sensorPropertySpec(props.sensor, property), [props.property]);
  const timeline = series.find((entry) => entry.kind === 'timeline' && entry.property === props.property);
  return timeline?.kind === 'timeline' ? timeline.segments : [];
});

const segments = computed(() => {
  const from = props.now - DAY;
  return history.value.flatMap(({ start, end, value }) => {
    const background = props.colorOf ? props.colorOf(value) : value === true ? SEGMENT_ACTIVE : undefined;
    if (!background) return [];
    return [{ left: `${((start - from) / DAY) * 100}%`, width: `${Math.max(((end - start) / DAY) * 100, 0.5)}%`, background }];
  });
});

const { active, anchor, listeners } = usePointerTooltip<HistorySegment>(locate, (a, b) => a.start === b.start);
const tip = computed(() => {
  const segment = active.value;
  if (!segment) return undefined;
  const from = shortMoment(segment.start, props.now, locale.value);
  const to = segment.end >= props.now ? t('components.sensor_tile.now') : shortMoment(segment.end, props.now, locale.value);
  return {
    title: sensorValueLabel(props.sensor.type, props.property, segment.value, sensorPropertySpec(props.sensor, props.property)),
    rows: [{ text: t('components.sensor_tile.span', { from, to }) }],
  };
});

function locate(event: PointerEvent): PointerTooltipHit<HistorySegment> | undefined {
  const box = (event.currentTarget as Element).getBoundingClientRect();
  const time = props.now - DAY + ((event.clientX - box.left) / box.width) * DAY;
  const segment = history.value.find((entry) => entry.start <= time && time <= entry.end);
  if (!segment || segment.value === null || segment.value === undefined) return undefined;
  return { target: segment, anchor: { x: event.clientX, top: box.top, bottom: box.bottom } };
}
</script>

<style scoped>
.timeline {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  width: 100%;
}

.timeline__track {
  position: relative;
  height: 0.75rem;
  border-radius: 999px;
  background: var(--p-content-hover-background);
  overflow: hidden;
}

.timeline__segment {
  position: absolute;
  top: 0;
  bottom: 0;
}

.timeline__axis {
  display: flex;
  justify-content: space-between;
  font-size: 0.6875rem;
  color: var(--text-secondary-color);
}
</style>
