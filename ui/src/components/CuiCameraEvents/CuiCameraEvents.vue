<template>
  <div ref="containerRef" class="relative min-w-0" :style="{ height: `${EVENT_CARD_HEIGHT}px` }">
    <div
      ref="scrollContainerRef"
      class="absolute top-0 overflow-x-auto overflow-y-hidden hide-scrollbar overscroll-x-contain"
      :style="bleedStyle"
      :class="{
        'overflow-x-hidden!': displayEvents.length === 0 && (isLoading || needsMoreEvents || noEvents),
      }"
    >
      <div class="relative" :style="{ width: `${displayEvents.length * EVENT_CARD_WIDTH}px`, height: `${EVENT_CARD_HEIGHT}px` }">
        <div class="absolute top-0 left-0 flex" :style="{ transform: `translateX(${renderOffset}px)` }">
          <template v-if="displayEvents.length === 0 && (isLoading || needsMoreEvents || noEvents)">
            <div v-for="i in skeletonCount" :key="`skeleton-${i}`" class="event-card flex flex-col items-center justify-center w-[140px] mr-3">
              <Skeleton class="rounded-xl" width="140px" height="140px" :animation="noEvents ? 'none' : 'wave'" />
              <Skeleton class="mt-2" width="50px" height="16px" :animation="noEvents ? 'none' : 'wave'" />
            </div>
          </template>

          <template v-else>
            <div v-for="item in visibleEvents" :key="item.key" class="event-card flex-none w-[140px] mr-3">
              <EpisodeCard v-if="item.episode" :episode="item.episode" :camera-by-id="cameraById" :click-disabled="isSwiping" />
              <CameraEvent
                v-else
                :event="item.event"
                :seg-index="item.segIndex"
                :segment="item.segment"
                :live="item.live"
                :camera-name="cameraMap.get(item.event.cameraId)"
                :camera="cameraById.get(item.event.cameraId)"
                :load-thumbnails="loadThumbnails"
                :click-disabled="isSwiping"
              />
            </div>
          </template>
        </div>
      </div>
    </div>

    <div v-if="noEvents && !isLoading && !needsMoreEvents" class="absolute top-[50px] left-[50%] translate-x-[-50%] z-2 px-3 py-2 text-shadow-md">
      <span class="text-sm text-color font-medium">{{
        eventsUnavailable ? $t('components.camera_events.events_unavailable') : $t('components.camera_events.no_events')
      }}</span>
    </div>

    <div v-if="!isAtStart && bleedLeft > 0" class="absolute pointer-events-none z-1" :style="fadeStyle" />

    <Transition name="fade-2">
      <Button
        v-if="!isAtStart && displayEvents.length > 0"
        rounded
        severity="secondary"
        class="absolute left-1 cui-icon-md shadow-md z-2 opacity-70 hover:opacity-100 transition-opacity"
        :style="{ top: '70px', transform: 'translateY(-50%)' }"
        @click="scrollToStart"
      >
        <template #icon>
          <i-tabler:chevron-left width="100%" height="100%" />
        </template>
      </Button>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { EventHoverPreviewKey, useDetectionEvents, useEventHoverPreview } from '@camera.ui/nvr';

import type { DBCamera } from '@shared/types';
import type { CuiCameraEventsProps } from './types.js';

const props = defineProps<CuiCameraEventsProps>();

// Provide shared hover preview instance (hover on desktop, long-press on touch)
if (typeof VideoDecoder !== 'undefined') {
  const hoverPreview = useEventHoverPreview({ cacheSize: 20 });
  provide(EventHoverPreviewKey, hoverPreview);
  tryOnScopeDispose(() => hoverPreview.dispose());
}

const EVENT_CARD_WIDTH = 152; // 140px card + 12px margin
const EVENT_CARD_HEIGHT = 172; // 140px thumbnail + 8px mt-2 + 16px text + 8px padding
const BUFFER = 5; // extra items rendered off-screen each side
let previousFirstId: string | undefined;

const { cameras } = toRefs(props);
const containerRef = useTemplateRef('containerRef');
const scrollContainerRef = useTemplateRef('scrollContainerRef');

const { containerWidth, bleedLeft, bleedStyle, fadeStyle, scrollLeft, isAtStart, isSwiping, scrollToStart } = useBleedScroll(containerRef, scrollContainerRef, {
  disabled: () => displayEvents.value.length === 0 && (isLoading.value || needsMoreEvents.value || noEvents.value),
});

const cameraMap = computed(() => {
  const map = new Map<string, string>();
  if (cameras.value) {
    for (const cam of cameras.value) {
      map.set(cam._id, cam.name);
    }
  }
  return map;
});

const cameraById = computed(() => {
  const map = new Map<string, DBCamera>();
  if (cameras.value) {
    for (const cam of cameras.value) {
      map.set(cam._id, cam);
    }
  }
  return map;
});

const availableCameraIds = computed<string[]>(() => {
  return cameras.value?.map((c) => c._id) ?? [];
});

const pageSize = computed(() => {
  const w = containerWidth.value || 800;
  return Math.ceil(w / EVENT_CARD_WIDTH) + 10;
});

const {
  segmentItems,
  isLoading,
  hasMore,
  loadMore,
  loadThumbnails,
  pluginUnavailable: eventsUnavailable,
} = useDetectionEvents({
  availableCameraIds,
  realtime: true,
  pageSize: pageSize.value,
  filter: () => ({ hasDetections: true, hiddenTypes: props.hiddenTypes }),
  withEpisodes: true,
  enabled: () => !props.pending,
});

const displayEvents = computed(() => segmentItems.value);
const visibleCardCount = computed(() => Math.ceil((containerWidth.value || 800) / EVENT_CARD_WIDTH));
const needsMoreEvents = computed(() => displayEvents.value.length < visibleCardCount.value && hasMore.value);
const noEvents = computed(() => !isLoading.value && displayEvents.value.length === 0 && !hasMore.value);
const skeletonCount = computed(() => (displayEvents.value.length === 0 ? 15 : 5));

const renderStart = computed(() => Math.max(0, Math.floor(scrollLeft.value / EVENT_CARD_WIDTH) - BUFFER));

const renderEnd = computed(() => {
  const visible = visibleCardCount.value;
  return Math.min(displayEvents.value.length, Math.ceil(scrollLeft.value / EVENT_CARD_WIDTH) + visible + BUFFER);
});

const visibleEvents = computed(() => displayEvents.value.slice(renderStart.value, renderEnd.value));

const renderOffset = computed(() => renderStart.value * EVENT_CARD_WIDTH);

useInfiniteScroll(scrollContainerRef, loadMore, {
  distance: 300,
  direction: 'right',
  canLoadMore: () => hasMore.value,
});

watch(
  () => displayEvents.value[0]?.key,
  (newId) => {
    if (!newId || newId === previousFirstId) return;
    const wasFirst = previousFirstId === undefined;
    previousFirstId = newId;
    if (wasFirst) return;

    const container = scrollContainerRef.value;
    const currentScroll = container?.scrollLeft || 0;
    const atStart = currentScroll < 5;

    if (atStart) {
      nextTick(() => {
        scrollContainerRef.value?.scrollTo({ left: 0, behavior: 'smooth' });
      });
    } else {
      nextTick(() => {
        if (container) {
          container.scrollLeft = currentScroll + EVENT_CARD_WIDTH;
        }
      });
    }
  },
);

watch([needsMoreEvents, () => isLoading.value], ([needsMore, loading]) => {
  if (needsMore && !loading) {
    loadMore();
  }
});
</script>

<style scoped></style>
