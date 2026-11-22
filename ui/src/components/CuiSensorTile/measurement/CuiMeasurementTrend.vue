<template>
  <div class="trend">
    <CuiTileHistoryHead :sensor :label="spanLabel" />

    <svg v-if="lines.length > 0" class="trend__plot" :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="none" aria-hidden="true">
      <path v-for="(line, index) in lines" :key="`area-${index}`" :d="line.area" class="trend__area" />
      <path v-for="(line, index) in lines" :key="`line-${index}`" :d="line.stroke" class="trend__line" />
    </svg>
    <span v-else-if="loaded" class="trend__empty">{{ t('components.sensor_tile.no_history') }}</span>

    <div v-if="lines.length > 0" class="trend__range">
      <span>{{ t('components.sensor_tile.min_value', { value: format(low) }) }}</span>
      <span>{{ t('components.sensor_tile.max_value', { value: format(high) }) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { sensorPropertySpec } from '@/common/sensorDisplay.js';
import { buildHistorySeries } from '@/components/CuiDialog/templates/SensorHistory/history.js';

import CuiTileHistoryHead from '../frame/CuiTileHistoryHead.vue';
import { DAY, shortMoment, useSensorHistory } from '../useSensorHistory.js';

import type { HistoryPoint } from '@/components/CuiDialog/templates/SensorHistory/history.js';
import type { CuiMeasurementTrendProps } from './types.js';

const MINUTE = 60_000;
const WIDTH = 300;
const HEIGHT = 64;
const INSET = 4;

const props = defineProps<CuiMeasurementTrendProps>();

const { t, locale } = useI18n();
const { entries, loaded, now } = useSensorHistory(
  () => props.sensor,
  () => props.property,
);

const points = computed(() => {
  const series = buildHistorySeries(entries.value, now.value - DAY, now.value, (property) => sensorPropertySpec(props.sensor, property), [props.property]);
  const line = series.find((entry) => entry.kind === 'line' && entry.property === props.property);
  return line?.kind === 'line' ? line.points : [];
});
const start = computed(() => points.value[0]?.time ?? now.value);
const values = computed(() => points.value.flatMap((point) => (point.value === null ? [] : [point.value])));
const low = computed(() => Math.min(...values.value));
const high = computed(() => Math.max(...values.value));

const lines = computed(() => {
  if (now.value - start.value < MINUTE || values.value.length === 0) return [];
  // a flat line sits in the middle instead of on the floor
  const spread = high.value - low.value || 1;
  const base = high.value === low.value ? low.value - spread / 2 : low.value;
  const x = (time: number) => ((time - start.value) / (now.value - start.value)) * WIDTH;
  const y = (value: number) => HEIGHT - INSET - ((value - base) / spread) * (HEIGHT - INSET * 2);
  return runs(points.value).map((run) => {
    const stroke = run.map((point, index) => `${index ? 'L' : 'M'}${x(point.time).toFixed(1)} ${y(point.value!).toFixed(1)}`).join(' ');
    return { stroke, area: `${stroke} L${x(run[run.length - 1].time).toFixed(1)} ${HEIGHT} L${x(run[0].time).toFixed(1)} ${HEIGHT} Z` };
  });
});

const spanLabel = computed(() => {
  if (start.value <= now.value - DAY + MINUTE) return t('components.sensor_tile.last_day');
  return t('components.sensor_tile.since', { time: shortMoment(start.value, now.value, locale.value) });
});

function runs(list: HistoryPoint[]): HistoryPoint[][] {
  const result: HistoryPoint[][] = [[]];
  for (const point of list) {
    if (point.value === null) result.push([]);
    else result[result.length - 1].push(point);
  }
  return result.filter((run) => run.length > 1);
}
</script>

<style scoped>
.trend {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  width: 100%;
}

.trend__plot {
  width: 100%;
  height: 4rem;
}

.trend__area {
  fill: color-mix(in srgb, var(--tile-color, var(--p-primary-color)) 18%, transparent);
  stroke: none;
}

.trend__line {
  fill: none;
  stroke: var(--tile-color, var(--p-primary-color));
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.trend__empty {
  font-size: 0.75rem;
  color: var(--text-secondary-color);
  text-align: center;
  padding: 1rem 0;
}

.trend__range {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--text-secondary-color);
  font-variant-numeric: tabular-nums;
}
</style>
