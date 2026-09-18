<template>
  <div ref="containerRef" class="recordings-grid-root relative">
    <CuiVirtualScroller
      v-if="rows.length > 0 && cellWidth > 0"
      :items="rows"
      :item-size="rowHeight"
      :scroll-height="scrollHeightPx"
      :num-tolerated-items="TOLERATED_ROWS"
      :item-key="resolveRowKey"
      orientation="vertical"
      class="recordings-scroll"
      @scroll="onScroll"
    >
      <template #item="{ item: row }">
        <div class="recordings-row">
          <div v-for="cell in row" :key="resolveKey(cell)" class="recordings-cell">
            <slot name="item" :item="cell" />
          </div>
        </div>
      </template>
    </CuiVirtualScroller>

    <div v-if="loadingMore" class="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 z-10 rounded-full bg-black/60 p-1.5">
      <i-svg-spinners:ring-resize width="18px" height="18px" class="text-white" />
    </div>
  </div>
</template>

<script setup lang="ts" generic="T">
import { CUI_RECORDINGS_GRID_DEFAULTS, TOLERATED_ROWS } from './types.js';

import type { CuiRecordingsGridProps } from './types.js';

const props = withDefaults(defineProps<CuiRecordingsGridProps<T>>(), CUI_RECORDINGS_GRID_DEFAULTS);

const containerRef = useTemplateRef<HTMLElement>('containerRef');
const { width: containerWidth, height: containerHeight } = useElementSize(containerRef);

const scrollY = ref(0);
const loadingMore = ref(false);

let stagnantAtLength: number | null = null;
let fillScheduled = false;

const scrollHeightPx = computed(() => (containerHeight.value > 0 ? `${containerHeight.value}px` : undefined));

const cols = computed(() => {
  const width = containerWidth.value;
  if (!width) return 0;
  return Math.max(1, Math.floor((width + props.gap) / (props.minItemWidth + props.gap)));
});

const cellWidth = computed(() => {
  const width = containerWidth.value;
  const count = cols.value;
  if (!width || !count) return 0;
  return Math.floor((width - (count - 1) * props.gap) / count);
});

const cellHeight = computed(() => (cellWidth.value ? Math.floor(cellWidth.value / props.aspectRatio) : 0));

const rowHeight = computed(() => (cellHeight.value ? cellHeight.value + props.gap : 0));

const rows = computed<T[][]>(() => {
  const count = cols.value;
  if (!count) return [];

  const result: T[][] = [];
  for (let index = 0; index < props.items.length; index += count) {
    result.push(props.items.slice(index, index + count));
  }
  return result;
});

function resolveKey(item: T): string | number {
  if (props.itemKey) return props.itemKey(item);
  const candidate = item as unknown as { id?: string | number; key?: string | number };
  return candidate.id ?? candidate.key ?? JSON.stringify(item);
}

// the first cell's key keeps the cards of a row alive while the rendered range
// shifts; keyed by index the scroller would remount them on every scroll step
function resolveRowKey(row: unknown): string | number | undefined {
  const cells = row as T[] | undefined;
  if (!cells || cells.length === 0) return undefined;
  return resolveKey(cells[0]);
}

async function tryLoadMore(): Promise<void> {
  if (loadingMore.value || !props.hasMore || !props.loadMore) return;
  if (stagnantAtLength !== null && props.items.length === stagnantAtLength) return;

  loadingMore.value = true;
  const before = props.items.length;
  try {
    await Promise.resolve(props.loadMore());
  } finally {
    loadingMore.value = false;
    stagnantAtLength = props.items.length === before ? before : null;
  }
}

function onScroll(event: Event): void {
  const element = event.target as HTMLElement | null;
  if (!element) return;

  scrollY.value = element.scrollTop;
  if (element.scrollTop + element.clientHeight >= element.scrollHeight - rowHeight.value * 3) {
    tryLoadMore();
  }
}

function scrollToTop(): void {
  const element = containerRef.value?.querySelector<HTMLElement>('.recordings-scroll');
  element?.scrollTo({ top: 0, behavior: 'smooth' });
}

// as CSS variables, not as style bindings: a binding sits in every row and cell
// and would re-render every card on each frame of a window resize
watchEffect(() => {
  const root = containerRef.value;
  if (!root || !cellWidth.value) return;

  root.style.setProperty('--cell-w', `${cellWidth.value}px`);
  root.style.setProperty('--cell-h', `${cellHeight.value}px`);
  root.style.setProperty('--cell-gap', `${props.gap}px`);
});

// rows that don't fill the viewport never produce a scroll event, so the next
// page has to be asked for here
watch(
  [() => props.items.length, containerHeight, rowHeight, () => props.hasMore],
  () => {
    if (fillScheduled) return;
    fillScheduled = true;
    nextTick(() => {
      fillScheduled = false;
      if (!props.hasMore || !rowHeight.value || !containerHeight.value) return;
      if (rows.value.length * rowHeight.value < containerHeight.value + rowHeight.value) {
        tryLoadMore();
      }
    });
  },
  { flush: 'post' },
);

defineExpose({ scrollToTop, scrollY });
</script>

<style scoped>
.recordings-grid-root {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.recordings-scroll {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-width: none;
  scroll-snap-type: y proximity;
}

.recordings-scroll::-webkit-scrollbar {
  display: none;
}

.recordings-row {
  display: flex;
  align-items: stretch;
  height: calc(var(--cell-h) + var(--cell-gap));
  gap: var(--cell-gap);
  scroll-snap-align: start;
}

.recordings-cell {
  width: var(--cell-w);
  height: var(--cell-h);
}
</style>
