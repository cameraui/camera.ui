<template>
  <div ref="containerRef" class="recordings-grid-root">
    <CuiVirtualScroller
      v-if="rows.length > 0 && cellSize > 0"
      :items="rows"
      :item-size="rowHeight"
      :scroll-height="scrollHeightPx"
      orientation="vertical"
      class="recordings-scroll"
      :num-tolerated-items="2"
      :item-key="resolveRowKey"
      @scroll="onScroll"
    >
      <template #item="{ item: row }">
        <div class="recordings-row" :style="{ height: `${rowHeight}px`, gap: `${gap}px` }">
          <div v-for="cell in row" :key="keyFn(cell)" :style="{ width: `${cellSize}px`, height: `${cellHeight}px` }">
            <slot name="item" :item="cell" />
          </div>
        </div>
      </template>
    </CuiVirtualScroller>
  </div>
</template>

<script setup lang="ts" generic="T">
const props = withDefaults(
  defineProps<{
    items: T[];
    minItemWidth: number;
    aspectRatio?: number;
    gap?: number;
    hasMore?: boolean;
    loadMore?: () => void | Promise<void>;
    itemKey?: (item: T) => string | number;
  }>(),
  {
    aspectRatio: 1,
    gap: 8,
    hasMore: false,
    loadMore: undefined,
    itemKey: undefined,
  },
);

const containerRef = useTemplateRef<HTMLElement>('containerRef');
const { width: containerWidth, height: containerHeight } = useElementSize(containerRef);

// The underlying PrimeVue virtual scroller hard-codes its element height via
// inline style (`setSize()` writes `height: Xpx` from offsetHeight) and only
// recomputes on window.resize, NOT on parent flex-container size changes.
// Worse, its own onResize reads the already-set inline height so it can never
// grow back. Driving its `scrollHeight` prop from our ResizeObserver-backed
// containerHeight forces setSize to use the true parent height and triggers
// the scroller's internal `scrollHeight` watcher → init() on every change.
const scrollHeightPx = computed<string | undefined>(() => (containerHeight.value > 0 ? `${containerHeight.value}px` : undefined));

const cols = computed(() => {
  const w = containerWidth.value;
  if (!w) return 0;
  const gap = props.gap;
  return Math.max(1, Math.floor((w + gap) / (props.minItemWidth + gap)));
});

const cellSize = computed(() => {
  const w = containerWidth.value;
  const c = cols.value;
  if (!w || !c) return 0;
  return Math.floor((w - (c - 1) * props.gap) / c);
});

const cellHeight = computed(() => {
  if (!cellSize.value) return 0;
  return Math.floor(cellSize.value / props.aspectRatio);
});

const rowHeight = computed(() => {
  if (!cellHeight.value) return 0;
  return cellHeight.value + props.gap;
});

const rows = computed<T[][]>(() => {
  const c = cols.value;
  if (!c) return [];
  const out: T[][] = [];
  for (let i = 0; i < props.items.length; i += c) {
    out.push(props.items.slice(i, i + c));
  }
  return out;
});

function keyFn(item: T): string | number {
  if (props.itemKey) return props.itemKey(item);
  const anyItem = item as unknown as { id?: string | number; key?: string | number };
  return anyItem.id ?? anyItem.key ?? JSON.stringify(item);
}

// Row-level stable key for the virtual scroller. Using the first cell's
// resolved key keeps slot VNodes (and therefore the RecordingCard instances
// inside them) alive across scroll-induced range shifts — without this the
// scroller keys rows by index, so scrolling by one row remounts every visible
// card because each slot's `row` prop changes to a completely different row
// array.
function resolveRowKey(row: unknown): string | number | undefined {
  const arr = row as T[] | undefined;
  if (!arr || arr.length === 0) return undefined;
  return keyFn(arr[0]);
}

// Single load-more entry point. Two guards keep us out of trouble: we
// serialize via an in-flight flag, and we remember the items.length at which
// the last load resolved without growth — any further trigger at that same
// length is a no-op until items actually change (filter swap, new NATS event).
let loadInFlight = false;
let stagnantAtLength: number | null = null;

async function tryLoadMore(): Promise<void> {
  if (loadInFlight || !props.hasMore || !props.loadMore) return;
  if (stagnantAtLength !== null && props.items.length === stagnantAtLength) return;

  loadInFlight = true;
  const before = props.items.length;
  try {
    await Promise.resolve(props.loadMore());
  } finally {
    loadInFlight = false;
    stagnantAtLength = props.items.length === before ? before : null;
  }
}

function onScroll(event: Event): void {
  const el = event.target as HTMLElement | null;
  if (!el) return;
  // Trigger when the user is within 3 rows of the bottom. We read the scroll
  // position directly instead of using @scroll-index-change because the
  // latter only fires when the rendered range *index* crosses a threshold,
  // which the tolerated-items buffering can swallow entirely on large grids.
  const threshold = rowHeight.value * 3;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - threshold) {
    tryLoadMore();
  }
}

function scrollToTop(): void {
  const el = containerRef.value?.querySelector<HTMLElement>('.recordings-scroll');
  el?.scrollTo({ top: 0, behavior: 'smooth' });
}

// Fallback: if the loaded rows don't fill the viewport, scroll events never
// fire. Whenever content-height < viewport-height and we still have more
// pages, request the next page. Debounced to nextTick so a burst of item
// updates doesn't fan out RPCs.
let fillScheduled = false;
watch(
  [() => props.items.length, containerHeight, rowHeight, () => props.hasMore],
  () => {
    if (fillScheduled) return;
    fillScheduled = true;
    nextTick(() => {
      fillScheduled = false;
      if (!props.hasMore) return;
      const viewportH = containerHeight.value;
      const contentH = rows.value.length * rowHeight.value;
      if (viewportH > 0 && rowHeight.value > 0 && contentH < viewportH + rowHeight.value) {
        tryLoadMore();
      }
    });
  },
  { flush: 'post' },
);

defineExpose({ scrollToTop });
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
  scrollbar-width: none;
  scroll-snap-type: y proximity;
}

.recordings-scroll::-webkit-scrollbar {
  display: none;
}

.recordings-row {
  display: flex;
  align-items: stretch;
  scroll-snap-align: start;
}
</style>
