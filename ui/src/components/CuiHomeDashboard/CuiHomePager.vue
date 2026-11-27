<template>
  <div ref="rootRef" class="home-pager">
    <div ref="trackRef" class="home-pager__track" @scroll.passive="onScroll">
      <div
        v-for="(page, index) in pages"
        :key="index"
        class="home-pager__page"
        :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, auto)`, gap: `${GAP}px` }"
      >
        <template v-for="item in page" :key="itemKey(item)">
          <slot :item />
        </template>
      </div>
    </div>
    <div v-if="pages.length > 1" class="home-pager__dots">
      <button
        v-for="(_, index) in pages"
        :key="index"
        type="button"
        class="home-pager__dot"
        :class="{ 'home-pager__dot--active': index === current }"
        :aria-label="t('views.home_dashboard.page_number', { number: index + 1 })"
        :aria-current="index === current ? 'true' : undefined"
        @click="show(index)"
      />
    </div>
  </div>
</template>

<script setup lang="ts" generic="T">
import type { CuiHomePagerProps } from './types.js';

const props = defineProps<CuiHomePagerProps<T>>();
defineSlots<{ default(props: { item: T }): unknown }>();

const { t } = useI18n();

const GAP = 6;
const DOTS_HEIGHT = 14;

const rootRef = useTemplateRef<HTMLDivElement>('rootRef');
const trackRef = useTemplateRef<HTMLDivElement>('trackRef');
const current = ref(0);

const { height } = useElementSize(rootRef);
const { width } = useElementSize(trackRef);

const columns = computed(() => Math.max(1, Math.floor((width.value + GAP) / (props.minWidth + GAP))));
const rows = computed(() => Math.max(1, Math.floor((height.value - DOTS_HEIGHT + GAP) / (props.rowHeight + GAP))));
const pages = computed(() => {
  const size = columns.value * rows.value;
  return Array.from({ length: Math.ceil(props.items.length / size) }, (_, index) => props.items.slice(index * size, (index + 1) * size));
});

function onScroll() {
  const track = trackRef.value;
  if (track?.clientWidth) current.value = Math.round(track.scrollLeft / track.clientWidth);
}

function show(index: number) {
  const track = trackRef.value;
  track?.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' });
}

watch(pages, () => (current.value = Math.min(current.value, Math.max(0, pages.value.length - 1))));
</script>

<style scoped>
.home-pager {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
  width: 100%;
}

.home-pager__track {
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
}

.home-pager__track::-webkit-scrollbar {
  display: none;
}

.home-pager__page {
  display: grid;
  flex: 0 0 100%;
  align-content: start;
  min-width: 0;
  scroll-snap-align: start;
}

.home-pager__dots {
  display: flex;
  justify-content: center;
  gap: 0.375rem;
}

.home-pager__dot {
  width: 0.375rem;
  height: 0.375rem;
  padding: 0;
  border-radius: 50%;
  background: var(--text-muted-color);
  opacity: 0.4;
  cursor: pointer;
  transition:
    opacity 0.2s ease,
    width 0.2s ease;
}

.home-pager__dot--active {
  width: 1rem;
  border-radius: 9999px;
  opacity: 1;
}
</style>
