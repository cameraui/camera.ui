import type { SensorHistoryEntry } from '@/api/routes/sensors.js';
import type { SensorPropertySpec } from '@camera.ui/sdk';

export interface HistoryPoint {
  time: number;
  value: number | null;
}

export interface HistorySegment {
  start: number;
  end: number;
  value: unknown;
}

export interface LineSeries {
  kind: 'line';
  property: string;
  points: HistoryPoint[];
  min: number;
  max: number;
  stepped: boolean;
}

export interface TimelineSeries {
  kind: 'timeline';
  property: string;
  segments: HistorySegment[];
}

export type HistorySeries = LineSeries | TimelineSeries;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const TICK_STEPS = [5 * MINUTE, 15 * MINUTE, 30 * MINUTE, HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];

export function buildHistorySeries(
  entries: readonly SensorHistoryEntry[],
  from: number,
  to: number,
  specOf: (property: string) => SensorPropertySpec | undefined,
  order: readonly string[],
): HistorySeries[] {
  const byProperty = new Map<string, SensorHistoryEntry[]>();
  for (const entry of [...entries].sort((a, b) => a.timestamp - b.timestamp)) {
    if (specOf(entry.property)?.internal) continue;
    const list = byProperty.get(entry.property);
    if (list) list.push(entry);
    else byProperty.set(entry.property, [entry]);
  }

  const series: HistorySeries[] = [];
  for (const [property, list] of byProperty) {
    const carried = list.findLast((entry) => entry.timestamp <= from);
    const changes = [
      ...(carried ? [{ time: from, value: carried.value }] : []),
      ...list.filter((entry) => entry.timestamp > from && entry.timestamp <= to).map((entry) => ({ time: entry.timestamp, value: entry.value })),
    ];
    if (!changes.length) continue;

    const spec = specOf(property);
    const numeric = spec ? spec.type === 'number' : typeof changes[0].value === 'number';
    series.push(numeric ? lineSeries(property, changes, to, spec?.writable === true) : timelineSeries(property, changes, to));
  }

  const rank = (property: string) => (order.includes(property) ? order.indexOf(property) : order.length);
  return series.sort((a, b) => rank(a.property) - rank(b.property) || a.property.localeCompare(b.property));
}

export function seriesValueAt(series: HistorySeries, time: number): unknown {
  if (series.kind === 'line') return series.points.findLast((point) => point.time <= time)?.value ?? null;
  return series.segments.find((segment) => segment.start <= time && time <= segment.end)?.value;
}

export function seriesChangeTimes(series: readonly HistorySeries[]): number[] {
  const times = series.flatMap((entry) => (entry.kind === 'line' ? entry.points.map((point) => point.time) : entry.segments.map((segment) => segment.start)));
  return [...new Set(times)].sort((a, b) => a - b);
}

export function timeTicks(from: number, to: number, maxTicks = 6): { ticks: number[]; step: number } {
  const step = TICK_STEPS.find((candidate) => (to - from) / candidate <= maxTicks) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const cursor = new Date(from);
  if (step >= DAY) cursor.setHours(0, 0, 0, 0);
  else if (step >= HOUR) cursor.setHours(cursor.getHours() - (cursor.getHours() % (step / HOUR)), 0, 0, 0);
  else cursor.setMinutes(cursor.getMinutes() - (cursor.getMinutes() % (step / MINUTE)), 0, 0);

  const ticks: number[] = [];
  while (cursor.getTime() <= to) {
    if (cursor.getTime() > from) ticks.push(cursor.getTime());
    // whole days by the calendar, so a daylight saving switch keeps ticks at midnight
    if (step >= DAY) cursor.setDate(cursor.getDate() + step / DAY);
    else cursor.setTime(cursor.getTime() + step);
  }
  return { ticks, step };
}

function lineSeries(property: string, changes: { time: number; value: unknown }[], to: number, stepped: boolean): LineSeries {
  const points = changes.map(({ time, value }) => ({ time, value: typeof value === 'number' && Number.isFinite(value) ? value : null }));
  points.push({ time: to, value: points[points.length - 1].value });

  const values = points.flatMap((point) => (point.value === null ? [] : [point.value]));
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 1;
  const pad = low === high ? Math.max(Math.abs(low) * 0.1, 1) : 0;
  return { kind: 'line', property, points, min: low - pad, max: high + pad, stepped };
}

function timelineSeries(property: string, changes: { time: number; value: unknown }[], to: number): TimelineSeries {
  const segments: HistorySegment[] = [];
  for (const [index, { time, value }] of changes.entries()) {
    const end = changes[index + 1]?.time ?? to;
    const last = segments[segments.length - 1];
    if (last && last.value === value) last.end = end;
    else if (end > time) segments.push({ start: time, end, value });
  }
  return { kind: 'timeline', property, segments };
}
