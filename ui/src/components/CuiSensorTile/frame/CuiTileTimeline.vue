<template>
  <div class="timeline">
    <CuiTileHistoryHead :sensor :label="t('components.sensor_tile.last_day')" />
    <div class="timeline__track">
      <span v-for="(segment, index) in segments" :key="index" class="timeline__segment" :style="segment" />
    </div>
    <div class="timeline__axis">
      <span>{{ shortMoment(now - DAY, now, locale) }}</span>
      <span>{{ t('components.sensor_tile.now') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { sensorPropertySpec } from '@/common/sensorDisplay.js';
import { buildHistorySeries } from '@/components/CuiDialog/templates/SensorHistory/history.js';

import { DAY, shortMoment } from '../useSensorHistory.js';
import CuiTileHistoryHead from './CuiTileHistoryHead.vue';

import type { CuiTileTimelineProps } from './types.js';

const props = defineProps<CuiTileTimelineProps>();

const { t, locale } = useI18n();

const segments = computed(() => {
  const from = props.now - DAY;
  const series = buildHistorySeries(props.entries, from, props.now, (property) => sensorPropertySpec(props.sensor, property), [props.property]);
  const timeline = series.find((entry) => entry.kind === 'timeline' && entry.property === props.property);
  if (timeline?.kind !== 'timeline') return [];
  return timeline.segments.flatMap(({ start, end, value }) => {
    const background = props.colorOf ? props.colorOf(value) : value === true ? 'var(--tile-color)' : undefined;
    if (!background) return [];
    return [{ left: `${((start - from) / DAY) * 100}%`, width: `${Math.max(((end - start) / DAY) * 100, 0.5)}%`, background }];
  });
});
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
