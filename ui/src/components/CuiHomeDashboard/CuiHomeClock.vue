<template>
  <div
    ref="rootRef"
    class="cui-tile home-clock"
    :class="`home-clock--${shape}`"
    :style="{ '--clock-size': `${fontSize}px`, '--clock-pad': `${pad}px` }"
    role="img"
    :aria-label="`${time}${period ? ` ${period}` : ''}, ${weekday}, ${day}`"
  >
    <span class="home-clock__time">
      {{ time }}<span v-if="period" class="home-clock__period">{{ period }}</span>
    </span>
    <span class="home-clock__date">
      <span class="home-clock__day">{{ shape === 'row' ? weekdayShort : weekday }}</span>
      <span class="home-clock__sub">{{ shape === 'row' ? dayShort : shape === 'square' && tall ? `${day} · ${week}` : day }}</span>
      <span v-if="shape === 'wide' && tall" class="home-clock__sub">{{ `${date.getFullYear()} · ${week}` }}</span>
    </span>
  </div>
</template>

<script setup lang="ts">
const { t, locale } = useI18n();

const ROW_BELOW = 100;
const COMPACT_BELOW = 176;
const TALL_FROM = 280;
const WIDE_RATIO = 1.8;
const CHAR_WIDTH = 0.53;
const PERIOD_WIDTH = 0.9;
const DAY_MS = 86_400_000;

const rootRef = useTemplateRef<HTMLDivElement>('rootRef');

const { width, height } = useElementSize(rootRef, undefined, { box: 'border-box' });
const now = useNow({ scheduler: (tick) => useIntervalFn(tick, 1_000) });

const minute = computed(() => Math.floor(now.value.getTime() / 60_000) * 60_000);
const date = computed(() => new Date(minute.value));
const parts = computed(() => new Intl.DateTimeFormat(locale.value, { hour: 'numeric', minute: '2-digit' }).formatToParts(minute.value));
const time = computed(() =>
  parts.value
    .filter((part) => part.type !== 'dayPeriod')
    .map((part) => part.value)
    .join('')
    .trim(),
);
const period = computed(() => parts.value.find((part) => part.type === 'dayPeriod')?.value);
const weekday = computed(() => date.value.toLocaleDateString(locale.value, { weekday: 'long' }));
const weekdayShort = computed(() => date.value.toLocaleDateString(locale.value, { weekday: 'short' }));
const day = computed(() => date.value.toLocaleDateString(locale.value, { day: 'numeric', month: 'long' }));
const dayShort = computed(() => date.value.toLocaleDateString(locale.value, { day: 'numeric', month: 'short' }));
const week = computed(() => t('views.home_dashboard.clock_week', { week: isoWeek(date.value) }));

const shape = computed(() => {
  if (height.value < ROW_BELOW) return 'row';
  return width.value / height.value >= WIDE_RATIO ? 'wide' : 'square';
});
const tall = computed(() => height.value >= TALL_FROM);
const pad = computed(() => {
  if (shape.value === 'row') return width.value < 190 ? 12 : 16;
  return height.value < COMPACT_BELOW ? 14 : 16;
});

const fontSize = computed(() => {
  const ratio = time.value.length * CHAR_WIDTH + (period.value ? PERIOD_WIDTH : 0);
  const inner = width.value - 2 * pad.value;
  const high = height.value - 2 * pad.value;
  const size = {
    row: Math.min((height.value - 24) * 0.78, (inner - 68) / ratio),
    wide: Math.min(high * 0.72, (inner - 120) / ratio),
    square: Math.min((high - 46) * 0.85, inner / ratio),
  }[shape.value];
  return Math.max(0, Math.floor(size));
});

function isoWeek(at: Date): number {
  const thursday = new Date(Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.ceil(((thursday.getTime() - yearStart) / DAY_MS + 1) / 7);
}
</script>

<style scoped>
.home-clock {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  height: 100%;
  min-width: 0;
  padding: var(--clock-pad);
  border-radius: 1.5rem;
  overflow: hidden;
  background: var(--p-content-background);
  box-shadow: inset 0 0 0 1px var(--border-color);
  user-select: none;
}

.home-clock--row {
  align-items: center;
  gap: 0.625rem;
  padding-block: 0;
}

.home-clock--wide {
  align-items: flex-end;
}

.home-clock--square {
  flex-direction: column-reverse;
}

.home-clock__time {
  font-size: var(--clock-size);
  font-weight: 300;
  line-height: 1;
  letter-spacing: -0.045em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--text-color);
}

.home-clock--wide .home-clock__time,
.home-clock--square .home-clock__time {
  margin-bottom: -0.1em;
}

.home-clock__period {
  margin-left: 0.15em;
  font-size: 0.32em;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--text-secondary-color);
}

.home-clock__date {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.home-clock--row .home-clock__date,
.home-clock--wide .home-clock__date {
  align-items: flex-end;
  text-align: right;
}

.home-clock--wide .home-clock__date {
  padding-bottom: 0.25rem;
}

.home-clock__day,
.home-clock__sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-clock__day {
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.25rem;
  color: var(--text-color);
}

.home-clock__sub {
  font-size: 0.8125rem;
  line-height: 1.125rem;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary-color);
}
</style>
