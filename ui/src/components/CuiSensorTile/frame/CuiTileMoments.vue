<template>
  <div class="flex flex-col gap-2 w-full">
    <CuiTileHistoryHead :sensor :label="t('components.sensor_tile.recent')" />
    <ul v-if="rows.length > 0" class="tile-moments">
      <li v-for="row in rows" :key="row.key" class="tile-moments__row">
        <span class="tile-moments__dot" :style="{ background: row.color ?? 'var(--tile-color, var(--text-secondary-color))' }" />
        <span class="tile-moments__text">
          <span class="tile-moments__label">{{ row.label }}</span>
          <span v-if="row.detail" class="tile-moments__detail">{{ row.detail }}</span>
        </span>
        <span class="tile-moments__time">{{ row.time }}</span>
      </li>
    </ul>
    <span v-else-if="loaded" class="text-xs text-muted">{{ t('components.sensor_tile.nothing_yet') }}</span>
  </div>
</template>

<script setup lang="ts">
import { shortMoment } from '../useSensorHistory.js';
import CuiTileHistoryHead from './CuiTileHistoryHead.vue';

import type { CuiTileMomentsProps } from './types.js';

const ROWS = 3;

const props = defineProps<CuiTileMomentsProps>();

const { t, locale } = useI18n();

const rows = computed(() => {
  const now = Date.now();
  return props.moments.slice(0, ROWS).map((moment) => ({
    key: `${moment.property}:${moment.timestamp}`,
    time: shortMoment(moment.timestamp, now, locale.value),
    ...props.describe(moment),
  }));
});
</script>

<style scoped>
.tile-moments {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.tile-moments__row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.375rem 0;
  font-size: 0.8125rem;
}

.tile-moments__row + .tile-moments__row {
  border-top: 1px solid var(--border-color);
}

.tile-moments__dot {
  flex-shrink: 0;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
}

.tile-moments__text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.tile-moments__label {
  color: var(--text-color);
  font-weight: 500;
}

.tile-moments__detail {
  font-size: 0.75rem;
  color: var(--text-muted-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile-moments__time {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--text-muted-color);
  font-variant-numeric: tabular-nums;
}
</style>
