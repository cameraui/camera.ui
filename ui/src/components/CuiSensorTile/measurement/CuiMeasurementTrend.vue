<template>
  <div class="trend">
    <CuiTileHistoryHead :sensor :label="spanLabel" />

    <div v-if="lines.length > 0" class="trend__chart" v-on="listeners">
      <svg class="trend__plot" :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="none" aria-hidden="true">
        <path v-for="(line, index) in lines" :key="`area-${index}`" :d="line.area" class="trend__area" />
        <path v-for="(line, index) in lines" :key="`line-${index}`" :d="line.stroke" class="trend__line" />
      </svg>
      <span v-if="marker" class="trend__dot" :style="marker" />
    </div>
    <span v-else-if="loaded" class="trend__empty">{{ t('components.sensor_tile.no_history') }}</span>

    <div v-if="lines.length > 0" class="trend__range">
      <span>{{ t('components.sensor_tile.min_value', { value: format(low) }) }}</span>
      <span>{{ t('components.sensor_tile.max_value', { value: format(high) }) }}</span>
    </div>

    <CuiChartTooltip :anchor :title="tip?.title" :rows="tip?.rows" />
  </div>
</template>

<script setup lang="ts">
import { sensorPropertySpec } from '@/common/sensorDisplay.js';
import { buildHistorySeries } from '@/components/CuiDialog/templates/SensorHistory/history.js';
import { usePointerTooltip } from '@/composables/usePointerTooltip.js';

import CuiTileHistoryHead from '../frame/CuiTileHistoryHead.vue';
import { DAY, shortMoment, useSensorHistory } from '../useSensorHistory.js';

import type { HistoryPoint } from '@/components/CuiDialog/templates/SensorHistory/history.js';
import type { PointerTooltipHit } from '@/composables/usePointerTooltip.js';
import type { CuiMeasurementTrendProps } from './types.js';

type KnownPoint = HistoryPoint & { value: number };

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
const known = computed(() => points.value.filter((point): point is KnownPoint => point.value !== null));
const values = computed(() => known.value.map((point) => point.value));
const low = computed(() => Math.min(...values.value));
const high = computed(() => Math.max(...values.value));

const scale = computed(() => {
  if (now.value - start.value < MINUTE || values.value.length === 0) return undefined;
  // a flat line sits in the middle instead of on the floor
  const spread = high.value - low.value || 1;
  const base = high.value === low.value ? low.value - spread / 2 : low.value;
  return {
    x: (time: number) => (time - start.value) / (now.value - start.value),
    y: (value: number) => (HEIGHT - INSET - ((value - base) / spread) * (HEIGHT - INSET * 2)) / HEIGHT,
  };
});

const lines = computed(() => {
  const plot = scale.value;
  if (!plot) return [];
  const x = (time: number) => (plot.x(time) * WIDTH).toFixed(1);
  return runs(points.value).map((run) => {
    const stroke = run.map((point, index) => `${index ? 'L' : 'M'}${x(point.time)} ${(plot.y(point.value!) * HEIGHT).toFixed(1)}`).join(' ');
    return { stroke, area: `${stroke} L${x(run[run.length - 1].time)} ${HEIGHT} L${x(run[0].time)} ${HEIGHT} Z` };
  });
});

const { active, anchor, listeners } = usePointerTooltip<KnownPoint>(locate, (a, b) => a.time === b.time);
const marker = computed(() => active.value && scale.value && { left: `${scale.value.x(active.value.time) * 100}%`, top: `${scale.value.y(active.value.value) * 100}%` });
const tip = computed(() => active.value && { title: shortMoment(active.value.time, now.value, locale.value), rows: [{ text: props.format(active.value.value) }] });

const spanLabel = computed(() => {
  if (start.value <= now.value - DAY + MINUTE) return t('components.sensor_tile.last_day');
  return t('components.sensor_tile.since', { time: shortMoment(start.value, now.value, locale.value) });
});

function locate(event: PointerEvent): PointerTooltipHit<KnownPoint> | undefined {
  const plot = scale.value;
  if (!plot) return undefined;
  const box = (event.currentTarget as Element).getBoundingClientRect();
  const at = (event.clientX - box.left) / box.width;
  const nearest = known.value.reduce<KnownPoint | undefined>(
    (best, point) => (!best || Math.abs(plot.x(point.time) - at) < Math.abs(plot.x(best.time) - at) ? point : best),
    undefined,
  );
  if (!nearest) return undefined;
  const y = box.top + plot.y(nearest.value) * box.height;
  return { target: nearest, anchor: { x: box.left + plot.x(nearest.time) * box.width, top: y, bottom: y } };
}

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

.trend__chart {
  position: relative;
}

.trend__plot {
  display: block;
  width: 100%;
  height: 4rem;
}

.trend__dot {
  position: absolute;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--tile-color, var(--p-primary-color));
  box-shadow: 0 0 0 2px var(--p-content-background);
  transform: translate(-50%, -50%);
  pointer-events: none;
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
