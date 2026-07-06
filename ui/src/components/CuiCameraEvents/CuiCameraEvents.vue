<template>
  <div ref="containerRef" class="relative min-w-0" :style="{ height: `${EVENT_CARD_HEIGHT}px` }">
    <div
      ref="scrollContainerRef"
      class="absolute top-0 overflow-x-auto overflow-y-hidden hide-scrollbar overscroll-x-contain"
      :style="bleedAbsStyle"
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
            <div v-for="event in visibleEvents" :key="event.id" class="event-card flex-none w-[140px] mr-3">
              <CameraEvent
                :event="event"
                :camera-name="cameraMap.get(event.cameraId)"
                :camera="cameraById.get(event.cameraId)"
                :load-thumbnails="loadThumbnails"
                :click-disabled="isSwiping"
              />
            </div>
          </template>
        </div>
      </div>
    </div>

    <div v-if="noEvents && !isLoading && !needsMoreEvents" class="absolute top-[50px] left-[50%] translate-x-[-50%] z-2 px-3 py-2 text-shadow-md">
      <span class="text-sm text-color font-medium">{{ $t('components.camera_events.no_events') }}</span>
    </div>

    <div v-if="!isAtStart && bleedOffsets.left > 0" class="absolute pointer-events-none z-1" :style="eventsStyle" />

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

const { isTouch } = useSharedCuiUserAgent();

// Provide shared hover preview instance (desktop only)
if (!isTouch.value && typeof VideoDecoder !== 'undefined') {
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
const isAtStart = ref(true);
const isSwiping = ref(false);
const bleedOffsets = ref({ left: 0, right: 0 });
const scrollLeft = ref(0);

const { width: containerWidth } = useElementSize(containerRef);

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

const { events, isLoading, hasMore, loadMore, loadThumbnails } = useDetectionEvents({
  availableCameraIds,
  realtime: true,
  pageSize: pageSize.value,
  filter: { hasDetections: true },
});

const { start: startSwipeReset } = useTimeoutFn(
  () => {
    isSwiping.value = false;
  },
  100,
  { immediate: false },
);

const displayEvents = computed(() => events.value);
const visibleCardCount = computed(() => Math.ceil((containerWidth.value || 800) / EVENT_CARD_WIDTH));
const needsMoreEvents = computed(() => displayEvents.value.length < visibleCardCount.value && hasMore.value);
const noEvents = computed(() => !isLoading.value && displayEvents.value.length === 0 && !hasMore.value);
const skeletonCount = computed(() => (displayEvents.value.length === 0 ? 15 : 5));

const bleedAbsStyle = computed(() => {
  const { left } = bleedOffsets.value;
  return {
    left: `${-left}px`,
    width: '100dvw',
    paddingLeft: `${left}px`,
  };
});

const eventsStyle = computed(() => {
  const totalWidth = bleedOffsets.value.left + 50;
  const stop1 = Math.min(Math.round((45 / totalWidth) * 100), 100);
  const stop2 = Math.min(Math.round((58 / totalWidth) * 100), 100);
  return {
    top: '-10px',
    height: 'calc(100% + 20px)',
    left: `${-bleedOffsets.value.left}px`,
    width: `${totalWidth}px`,
    // eslint-disable-next-line @stylistic/max-len
    background: `linear-gradient(270deg, transparent 0%, rgba(var(--ground-background-val), 0.8) ${stop1}%, rgba(var(--ground-background-val), 0.9) ${stop2}%, rgba(var(--ground-background-val), 0.95) 100%)`,
  };
});

const renderStart = computed(() => Math.max(0, Math.floor(scrollLeft.value / EVENT_CARD_WIDTH) - BUFFER));

const renderEnd = computed(() => {
  const visible = visibleCardCount.value;
  return Math.min(displayEvents.value.length, Math.ceil(scrollLeft.value / EVENT_CARD_WIDTH) + visible + BUFFER);
});

const visibleEvents = computed(() => displayEvents.value.slice(renderStart.value, renderEnd.value));

const renderOffset = computed(() => renderStart.value * EVENT_CARD_WIDTH);

function updateBleed(): void {
  const el = containerRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  bleedOffsets.value = { left: rect.left, right: window.innerWidth - rect.right };
}

function scrollToStart(): void {
  const container = scrollContainerRef.value;
  if (!container) return;
  scrollLeft.value = 0;
  nextTick(() => {
    container.scrollTo({ left: 0, behavior: 'smooth' });
  });
}

function updateScrollPosition(): void {
  const container = scrollContainerRef.value;
  if (!container) return;
  scrollLeft.value = container.scrollLeft;
  isAtStart.value = container.scrollLeft < 5;
}

function setupSwipe(): void {
  usePointerSwipe(scrollContainerRef, {
    disableTextSelect: true,
    threshold: 10,
    onSwipe: (e: PointerEvent) => {
      if (displayEvents.value.length === 0 && (isLoading.value || needsMoreEvents.value || noEvents.value)) return;
      isSwiping.value = true;
      scrollContainerRef.value?.classList.add('cursor-grabbing');
      scrollContainerRef.value?.scrollBy({ left: -e.movementX, behavior: 'smooth' });
    },
    onSwipeEnd: () => {
      scrollContainerRef.value?.classList.remove('cursor-grabbing');
      startSwipeReset();
    },
  });
}

useEventListener(window, 'resize', updateBleed);
useEventListener(scrollContainerRef, 'scroll', updateScrollPosition, { passive: true });

// Mouse wheel → horizontal scroll
useEventListener(
  scrollContainerRef,
  'wheel',
  (e: WheelEvent) => {
    if (displayEvents.value.length === 0 && (isLoading.value || needsMoreEvents.value || noEvents.value)) return;

    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      scrollContainerRef.value?.scrollBy({ left: e.deltaY });
    }
  },
  { passive: false },
);

useInfiniteScroll(scrollContainerRef, loadMore, {
  distance: 300,
  direction: 'right',
  canLoadMore: () => hasMore.value,
});

watch(containerWidth, () => updateBleed());

watch(
  () => displayEvents.value[0]?.id,
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

onMounted(() => {
  updateBleed();
  const mainEl = document.getElementById('container');
  if (mainEl) {
    useEventListener(mainEl, 'transitionend', updateBleed);
  }
  if (!isTouch.value) {
    setupSwipe();
  }
});
</script>

<style scoped></style>
