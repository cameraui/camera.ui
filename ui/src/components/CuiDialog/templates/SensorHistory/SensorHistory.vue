<template>
  <div class="history flex flex-col gap-3 w-full min-h-[200px]">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <SelectButton v-model="range" :options="rangeOptions" option-label="label" option-value="value" :allow-empty="false" size="small" />
      <SelectButton v-model="view" :options="viewOptions" option-label="label" option-value="value" :allow-empty="false" size="small">
        <template #option="{ option }">
          <component :is="option.icon" v-tooltip.top="option.label" :aria-label="option.label" class="w-4 h-4" />
        </template>
      </SelectButton>
    </div>

    <div v-if="isLoading" class="flex flex-col gap-3">
      <Skeleton v-for="i in 3" :key="i" height="48px" class="rounded-lg" />
    </div>

    <div v-else-if="!series.length" class="flex flex-1 flex-col items-center justify-center gap-3 py-10">
      <i-mdi:history class="w-10 h-10 text-muted" />
      <span class="text-muted text-sm">{{ $t('views.sensors.history_empty') }}</span>
    </div>

    <div v-else-if="view === 'chart'" class="flex flex-col gap-1 overflow-x-clip">
      <div class="h-4 text-xs text-muted tabular-nums text-right">{{ cursor === undefined ? '' : formatTimestamp(cursor) }}</div>

      <div
        ref="plotRef"
        class="flex flex-col gap-3 select-none touch-pan-y"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="pressed = false"
        @pointercancel="onPointerCancel"
        @pointerleave="onPointerLeave"
      >
        <div v-for="row in series" :key="row.property" class="flex flex-col gap-1">
          <div class="flex items-baseline justify-between gap-3 text-sm min-w-0">
            <span class="text-muted truncate">{{ propertyLabel(row.property) }}</span>
            <span class="font-semibold text-color tabular-nums truncate">{{ valueLabel(row.property, seriesValueAt(row, cursor ?? to)) }}</span>
          </div>

          <svg v-if="row.kind === 'line'" :width="plotWidth" :height="LINE_HEIGHT" class="block overflow-visible">
            <line :x1="0" :x2="plotWidth" :y1="LINE_HEIGHT - 0.5" :y2="LINE_HEIGHT - 0.5" class="history-grid" />
            <text x="0" y="10" class="history-axis-label">{{ valueLabel(row.property, row.max) }}</text>
            <text x="0" :y="LINE_HEIGHT - 4" class="history-axis-label">{{ valueLabel(row.property, row.min) }}</text>
            <path :d="linePath(row)" class="history-line" />
            <template v-if="cursor !== undefined">
              <line :x1="cursorX" :x2="cursorX" y1="0" :y2="LINE_HEIGHT" class="history-crosshair" />
              <circle v-if="lineValueAt(row) !== null" :cx="cursorX" :cy="yOf(row, lineValueAt(row)!)" r="4" class="history-dot" />
            </template>
          </svg>

          <svg v-else :width="plotWidth" :height="BAND_HEIGHT" class="block overflow-visible">
            <rect
              v-for="segment in row.segments"
              :key="segment.start"
              :x="xOf(segment.start) + SEGMENT_GAP / 2"
              :width="Math.max(1, xOf(segment.end) - xOf(segment.start) - SEGMENT_GAP)"
              y="0"
              :height="BAND_HEIGHT"
              rx="3"
              :style="{ fill: segmentColor(row.property, segment.value) }"
            />
            <line v-if="cursor !== undefined" :x1="cursorX" :x2="cursorX" y1="-2" :y2="BAND_HEIGHT + 2" class="history-crosshair" />
          </svg>
        </div>

        <div class="relative h-4 text-[11px] leading-4 text-muted tabular-nums">
          <span v-for="tick in axis.ticks" :key="tick" class="absolute -translate-x-1/2 whitespace-nowrap" :style="{ left: `${xOf(tick)}px` }">
            {{ formatTick(tick) }}
          </span>
        </div>
      </div>
    </div>

    <div v-else class="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
      <div v-for="(entry, idx) in listEntries" :key="idx" class="flex items-center gap-3 p-2 rounded-lg border-color">
        <div class="flex flex-col flex-1 min-w-0">
          <span class="text-sm font-medium truncate">{{ propertyLabel(entry.property) }}</span>
          <span class="text-xs text-muted">{{ formatTimestamp(entry.timestamp) }}</span>
        </div>
        <span class="text-sm font-mono shrink-0">{{ valueLabel(entry.property, entry.value) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { sensorMeta } from '@camera.ui/sdk';
import ChartIcon from '~icons/mdi/chart-timeline-variant';
import ListIcon from '~icons/mdi/format-list-bulleted';

import { getSensorHistoryFn } from '@/api/routes/sensors.js';
import { sensorPropertyLabelKey, sensorValueLabel } from '@/common/sensorDisplay.js';
import { hoverActive } from '@/plugins/hover.js';

import { buildHistorySeries, seriesChangeTimes, seriesValueAt, timeTicks } from './history.js';

import type { SensorHistoryEntry } from '@/api/routes/sensors.js';
import type { SensorPropertySpec } from '@camera.ui/sdk';
import type { LineSeries } from './history.js';
import type { HistoryRange, SensorHistoryProps } from './types.js';

const props = defineProps<SensorHistoryProps>();

const { t, te, locale } = useI18n();

const LINE_HEIGHT = 64;
const BAND_HEIGHT = 20;
const SEGMENT_GAP = 2;
const SNAP_PX = 10;
const SERIES_SLOTS = 8;
const RANGE_MS: Record<Exclude<HistoryRange, 'all'>, number> = { day: 24 * 3_600_000, week: 7 * 24 * 3_600_000 };

const plotRef = useTemplateRef<HTMLElement>('plotRef');
const { width: plotWidth } = useElementSize(plotRef);

const entries = ref<SensorHistoryEntry[]>([]);
const isLoading = ref(true);
const range = ref<HistoryRange>('day');
const view = ref('chart');
const cursor = ref<number>();
const pressed = ref(false);
const to = ref(Date.now());

const meta = computed(() => sensorMeta(props.sensorType));

const viewOptions = computed(() => [
  { value: 'chart', icon: ChartIcon, label: t('views.sensors.history_chart') },
  { value: 'list', icon: ListIcon, label: t('views.sensors.history_list') },
]);
const rangeOptions = computed(() => [
  { label: t('views.sensors.history_range_day'), value: 'day' },
  { label: t('views.sensors.history_range_week'), value: 'week' },
  { label: t('views.sensors.history_range_all'), value: 'all' },
]);

const from = computed(() => {
  if (range.value !== 'all') return to.value - RANGE_MS[range.value];
  const oldest = Math.min(...entries.value.map((entry) => entry.timestamp));
  return Math.min(oldest, to.value - 3_600_000);
});

const series = computed(() => buildHistorySeries(entries.value, from.value, to.value, specOf, Object.keys(meta.value?.properties ?? {})));
const changeTimes = computed(() => seriesChangeTimes(series.value));
const axis = computed(() => timeTicks(from.value, to.value, Math.max(2, Math.floor(plotWidth.value / 90))));
const cursorX = computed(() => (cursor.value === undefined ? 0 : xOf(cursor.value)));

const listEntries = computed(() =>
  entries.value.filter((entry) => entry.timestamp >= from.value && !specOf(entry.property)?.internal).sort((a, b) => b.timestamp - a.timestamp),
);

const valueSlots = computed(() => {
  const slots = new Map<string, unknown[]>();
  for (const entry of [...entries.value].sort((a, b) => a.timestamp - b.timestamp)) {
    const known = slots.get(entry.property) ?? slotOrder(entry.property);
    if (!known.includes(entry.value)) known.push(entry.value);
    slots.set(entry.property, known);
  }
  return slots;
});

onClickOutside(plotRef, () => {
  cursor.value = undefined;
});

function specOf(property: string): SensorPropertySpec | undefined {
  return props.propertySpecs?.[property] ?? meta.value?.properties[property];
}

function slotOrder(property: string): unknown[] {
  const spec = specOf(property);
  if (spec?.choices) return spec.choices.map((choice) => choice.value);
  if (spec?.type === 'enum') return Object.entries(spec.values ?? {}).flatMap(([name, value]) => (name === 'off' ? [] : [value]));
  if (spec?.type === 'boolean') return [true];
  return [];
}

function segmentColor(property: string, value: unknown): string {
  if (value === false || value === null || value === undefined || value === '' || isOffValue(property, value)) return 'var(--history-off)';
  const slot = valueSlots.value.get(property)?.indexOf(value) ?? -1;
  // more states than slots share one color instead of repeating a hue
  return slot >= 0 && slot < SERIES_SLOTS ? `var(--history-series-${slot + 1})` : 'var(--history-other)';
}

function isOffValue(property: string, value: unknown): boolean {
  const spec = specOf(property);
  return spec?.type === 'enum' && spec.values?.off === value;
}

function xOf(time: number): number {
  const span = to.value - from.value;
  return span > 0 ? ((time - from.value) / span) * plotWidth.value : 0;
}

function yOf(row: LineSeries, value: number): number {
  const span = row.max - row.min;
  const pad = 4;
  return pad + (1 - (value - row.min) / span) * (LINE_HEIGHT - 2 * pad);
}

function linePath(row: LineSeries): string {
  let path = '';
  let previous: { x: number; y: number } | undefined;
  for (const point of row.points) {
    if (point.value === null) {
      previous = undefined;
      continue;
    }
    const x = xOf(point.time);
    const y = yOf(row, point.value);
    if (!previous) path += `M${x},${y}`;
    else if (row.stepped) path += `H${x}V${y}`;
    else path += `L${x},${y}`;
    previous = { x, y };
  }
  return path;
}

function lineValueAt(row: LineSeries): number | null {
  return cursor.value === undefined ? null : (seriesValueAt(row, cursor.value) as number | null);
}

function pointTo(event: PointerEvent) {
  const box = plotRef.value?.getBoundingClientRect();
  if (!box?.width) return;
  const x = Math.min(Math.max(event.clientX - box.left, 0), box.width);
  const time = from.value + (x / box.width) * (to.value - from.value);
  const nearest = changeTimes.value.reduce<number | undefined>(
    (best, change) => (best === undefined || Math.abs(change - time) < Math.abs(best - time) ? change : best),
    undefined,
  );
  cursor.value = nearest !== undefined && Math.abs(xOf(nearest) - x) <= SNAP_PX ? nearest : time;
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse') return;
  pressed.value = true;
  pointTo(event);
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerType === 'mouse' ? hoverActive() : pressed.value) pointTo(event);
}

function onPointerCancel() {
  pressed.value = false;
  cursor.value = undefined;
}

function onPointerLeave(event: PointerEvent) {
  if (event.pointerType === 'mouse') cursor.value = undefined;
}

function propertyLabel(property: string): string {
  const key = `components.automation_nodes.${sensorPropertyLabelKey(props.sensorType, property)}`;
  return te(key) ? t(key) : property;
}

function valueLabel(property: string, value: unknown): string {
  return sensorValueLabel(props.sensorType, property, value, specOf(property));
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'medium' });
}

function formatTick(tick: number): string {
  const options: Intl.DateTimeFormatOptions = axis.value.step >= 24 * 3_600_000 ? { day: 'numeric', month: 'short' } : { hour: '2-digit', minute: '2-digit' };
  return new Date(tick).toLocaleString(locale.value, options);
}

watch(range, () => {
  to.value = Date.now();
  cursor.value = undefined;
});

onMounted(async () => {
  try {
    entries.value = await getSensorHistoryFn({ id: props.sensorId, limit: 500 });
  } catch {
    entries.value = [];
  } finally {
    to.value = Date.now();
    isLoading.value = false;
  }
});
</script>

<style scoped>
.history {
  --history-series-1: #2a78d6;
  --history-series-2: #eb6834;
  --history-series-3: #1baf7a;
  --history-series-4: #eda100;
  --history-series-5: #e87ba4;
  --history-series-6: #008300;
  --history-series-7: #6250d6;
  --history-series-8: #e34948;
  --history-off: color-mix(in srgb, var(--p-text-muted-color) 25%, transparent);
  --history-other: color-mix(in srgb, var(--p-text-muted-color) 55%, transparent);
}

.dark-mode .history {
  --history-series-1: #3987e5;
  --history-series-2: #d95926;
  --history-series-3: #199e70;
  --history-series-4: #c98500;
  --history-series-5: #d55181;
  --history-series-6: #0ca30c;
  --history-series-7: #9085e9;
  --history-series-8: #e66767;
}

.history-line {
  fill: none;
  stroke: var(--history-series-1);
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.history-grid {
  stroke: var(--p-text-muted-color);
  stroke-opacity: 0.25;
}

.history-axis-label {
  fill: var(--p-text-muted-color);
  font-size: 10px;
}

.history-crosshair {
  stroke: var(--p-text-color);
  stroke-opacity: 0.5;
  stroke-width: 1;
}

.history-dot {
  fill: var(--history-series-1);
  stroke: var(--p-content-background);
  stroke-width: 2;
}
</style>
