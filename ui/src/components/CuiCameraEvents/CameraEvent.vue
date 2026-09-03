<template>
  <div ref="cardRef" class="camera-event-card relative group cursor-pointer" @click="openCameraEvent" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave">
    <AiBadge v-if="descriptionTitle" />

    <div class="bg-neutral-900 w-[140px] h-[140px] rounded-xl overflow-hidden relative">
      <Skeleton v-if="thumbnailState === 'loading'" class="w-full h-full rounded-xl" width="140px" height="140px" />

      <template v-else-if="displayUrl">
        <img v-if="cropShown" :src="displayUrl" aria-hidden="true" class="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-50 pointer-events-none" />
        <CuiImage
          :src="displayUrl"
          :alt="props.cameraName"
          class="pointer-events-none w-full h-full transition-transform duration-300 group-hover:scale-105"
          :image-style="{ objectFit: cropShown ? 'contain' : 'cover' }"
          width="140px"
          height="140px"
          image-container-class="w-full h-full"
        />
      </template>

      <div v-else class="w-full h-full flex items-center justify-center bg-neutral-800/80">
        <component :is="typeIcon" class="w-8 h-8 text-white/20" />
      </div>

      <canvas v-if="preview" ref="previewCanvasRef" v-show="isPreviewActive" class="absolute inset-0 w-full h-full object-cover pointer-events-none z-[1]" />

      <div
        v-if="preview && isPreviewActive && preview.isLoading.value && !hasDescription"
        class="absolute inset-0 z-[3] flex items-center justify-center pointer-events-none"
      >
        <ProgressSpinner class="w-[24px] h-[24px] m-0" stroke-width="3" />
      </div>

      <div v-if="previewIndicator" class="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-[3] pointer-events-none">
        <span class="text-[10px] font-semibold text-white bg-black/60 px-1.5 py-0.5 rounded-md whitespace-nowrap" style="font-variant-numeric: tabular-nums">
          {{ previewIndicator }}
        </span>
      </div>

      <div v-if="isActive" class="absolute top-1.5 left-1.5 z-[3] flex items-center gap-1">
        <span class="relative flex h-2.5 w-2.5">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
        </span>
      </div>

      <template v-if="carouselImages.length > 1">
        <Button
          rounded
          text
          severity="secondary"
          class="!absolute left-0.5 top-1/2 -translate-y-1/2 z-[3] !w-6 !h-6 !p-0 bg-black/40 hover:!bg-black/60"
          :aria-label="$t('views.recordings.prev_image')"
          @click.stop="stepImage(-1)"
          @mouseenter="stopPreview"
        >
          <template #icon>
            <i-mdi:chevron-left class="w-4 h-4 text-white" />
          </template>
        </Button>
        <Button
          rounded
          text
          severity="secondary"
          class="!absolute right-0.5 top-1/2 -translate-y-1/2 z-[3] !w-6 !h-6 !p-0 bg-black/40 hover:!bg-black/60"
          :aria-label="$t('views.recordings.next_image')"
          @click.stop="stepImage(1)"
          @mouseenter="stopPreview"
        >
          <template #icon>
            <i-mdi:chevron-right class="w-4 h-4 text-white" />
          </template>
        </Button>
      </template>

      <div v-if="displayUrl && displayLabel" class="absolute top-1 left-1/2 -translate-x-1/2 z-[2] max-w-[85%] pointer-events-none">
        <span class="block text-[10px] text-white font-medium truncate bg-black/40 rounded px-1.5 py-0.5">{{ displayLabel }}</span>
      </div>

      <div v-if="displayUrl && carouselImages.length > 1" class="absolute bottom-1 left-1/2 -translate-x-1/2 z-[2] flex items-center gap-1 pointer-events-none">
        <span
          v-for="(_, i) in carouselImages"
          :key="i"
          class="w-1.5 h-1.5 rounded-full transition-colors duration-200"
          :class="i === activeImageIndex ? 'bg-white' : 'bg-white/40'"
        />
      </div>

      <div
        v-if="displayUrl"
        class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex flex-col items-center justify-end gap-1 z-[2] pointer-events-none"
        :class="previewIndicator ? 'pb-8' : 'pb-3'"
      >
        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <component :is="eventIcons[type] ?? genericIcon" v-for="type in displayTypes" :key="type" class="w-3.5 h-3.5 text-white/50" />
        </div>
        <span class="text-xs text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 truncate max-w-[130px] px-1">
          {{ props.cameraName }}
        </span>
      </div>
    </div>

    <div class="mt-2 text-center">
      <p class="text-xs text-muted">{{ formatTime }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  attributeThumbnails,
  EventHoverPreviewKey,
  getPrimaryType,
  previewFocusTrack,
  previewPlayableEnd,
  resolveThumbnail,
  segmentTypes,
  thumbnailToUrl,
  useEventStore,
} from '@camera.ui/nvr';
import SparklesIcon from '~icons/tabler/sparkles';

import CameraEventDialog from '@/components/CuiDialog/templates/CameraStreamEvent/CameraStreamEvent.vue';
import { eventAnchorTime, segmentLabel } from '@/utils/eventAnchor.js';
import { resolveEventIcons } from '@/utils/eventIcons.js';

import type { CameraStreamEventProps } from '@/components/CuiDialog/templates/CameraStreamEvent/types.js';
import type { EventThumbnails } from '@camera.ui/nvr';
import type { DynamicDialogInstance } from 'primevue/dynamicdialogoptions';
import type { CameraEventProps } from './types.js';

const props = defineProps<CameraEventProps>();

const dialog = useCuiDialog();
const { t } = useI18n();
const preview = inject(EventHoverPreviewKey, undefined);
const eventStore = useEventStore('@camera.ui/camera-ui-nvr');

// Live edge threshold — events starting within this window open as live stream.
const LIVE_EDGE_MS = 10_000;

const previewCanvasRef = useTemplateRef('previewCanvasRef');
const cardRef = useTemplateRef('cardRef');
const isPreviewActive = ref(false);
const loadedThumbs = ref<EventThumbnails | null>(null);
const thumbnailState = ref<'loading' | 'loaded' | 'empty'>('loading');
const activeImageIndexRaw = ref(0);
const previewBlocked = ref(false);

let dialogInstance: DynamicDialogInstance | undefined;
let loadTriggered = false;

const { icons: eventIcons, generic: genericIcon } = resolveEventIcons();

const longPress = useLongPressPreview(
  cardRef,
  () => startPreview(),
  () => stopPreview(),
);

const cardSegIndex = computed(() => (props.segment && props.segIndex !== undefined ? props.segIndex : undefined));

const primary = computed(() => (loadedThumbs.value ? resolveThumbnail(loadedThumbs.value, props.event, 'card', cardSegIndex.value) : null));

const carouselImages = computed<{ url: string; label?: string; type: string; crop: boolean }[]>(() => {
  const thumbs = loadedThumbs.value;
  const sceneUrl = primary.value?.url;
  if (!thumbs || !sceneUrl) return [];

  const items = [{ url: sceneUrl, label: primary.value?.label, type: primary.value?.type ?? getPrimaryType(props.event), crop: false }];
  for (const tile of attributeThumbnails(thumbs, cardSegIndex.value)) {
    if (items.some((item) => item.url === tile.url)) continue;
    items.push({ url: tile.url, label: tile.label, type: tile.type, crop: true });
  }
  if (cardSegIndex.value === undefined) {
    for (const key of Object.keys(thumbs.cards ?? thumbs.strips ?? {}).sort((a, b) => Number(a) - Number(b))) {
      const url = thumbnailToUrl(thumbs.cards?.[key] ?? thumbs.strips?.[key]);
      if (!url || items.some((item) => item.url === url)) continue;
      const label = segmentLabel(props.event, key);
      items.push({ url, label, type: label, crop: false });
    }
  }
  return items.length > 1 ? items : [];
});

const activeImageIndex = computed(() => (carouselImages.value.length ? Math.min(activeImageIndexRaw.value, carouselImages.value.length - 1) : 0));
const activeImage = computed(() => (carouselImages.value.length > 1 ? carouselImages.value[activeImageIndex.value] : undefined));
const cropShown = computed(() => Boolean(activeImage.value?.crop));
const displayUrl = computed(() => activeImage.value?.url ?? primary.value?.url);
const displayLabel = computed(() => activeImage.value?.label ?? primary.value?.label);
const activeType = computed(() => activeImage.value?.type ?? primary.value?.type ?? getPrimaryType(props.event));

const typeIcon = computed<Component>(() => eventIcons[activeType.value] ?? genericIcon);

const uniqueTypes = computed(() => {
  const types = props.segment ? segmentTypes(props.event, props.segment) : [...new Set(props.event.types)];
  return types.filter((t: string) => t !== 'motion' && t !== 'audio');
});
const displayTypes = computed(() => uniqueTypes.value.slice(0, 4));

const formatTime = computed(() => {
  const date = new Date(props.segment?.firstSeen ?? props.event.thumbnailAt ?? props.event.startTime);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
});

const anchorTime = computed(() => props.segment?.firstSeen ?? eventAnchorTime(props.event));

const isActive = computed(() => (props.segment ? props.live === true : props.event.state === 'active'));
const description = computed(() => (props.segment ? props.segment.description : props.event.segments?.find((s) => s?.description)?.description));
const hasDescription = computed(() => !isActive.value && Boolean(description.value));
const descriptionTitle = computed(() => description.value?.title);

const previewIndicator = computed(() => {
  if (!preview) return '';
  if (previewBlocked.value) return t('views.recordings.no_preview');
  if (!isPreviewActive.value) return '';
  if (preview.status.value === 'unavailable') return t('views.recordings.no_preview');
  if (preview.status.value === 'playing' && preview.previewTimeMs.value) return formatClock(preview.previewTimeMs.value);
  return '';
});

function stepImage(delta: number): void {
  const len = carouselImages.value.length;
  if (!len) return;
  stopPreview();
  activeImageIndexRaw.value = (activeImageIndex.value + delta + len) % len;
}

function stopPreview(): void {
  previewBlocked.value = false;
  if (!preview || !isPreviewActive.value) return;
  isPreviewActive.value = false;
  preview.onHoverEnd();
}

function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function startPreview(): void {
  if (!preview) return;
  if (activeImageIndex.value > 0) return;
  const canvas = previewCanvasRef.value;
  if (!canvas) return;
  const from = props.segment?.firstSeen ?? props.event.startTime;
  const to = props.segment ? props.segment.lastSeen : previewPlayableEnd(props.event);
  if (!to) {
    previewBlocked.value = true;
    return;
  }
  isPreviewActive.value = true;
  preview.onHoverStart(canvas, props.event.cameraId, props.event.id, from, to, props.camera?.zones?.privacy, previewFocusTrack(props.event, cardSegIndex.value));
}

function handleMouseEnter(): void {
  if (longPress.blocksMouseEnter()) return;
  startPreview();
}

function handleMouseLeave(): void {
  previewBlocked.value = false;
  if (!preview) return;
  isPreviewActive.value = false;
  preview.onHoverEnd();
}

function applyThumbnails(thumbs: EventThumbnails): boolean {
  const resolved = resolveThumbnail(thumbs, props.event, 'card', cardSegIndex.value);
  if (!resolved.url) return false;
  loadedThumbs.value = thumbs;
  thumbnailState.value = 'loaded';
  return true;
}

async function triggerLoad(retries = 2): Promise<void> {
  const thumbs = await props.loadThumbnails(props.event.id, props.event.startTime);
  if (thumbs && applyThumbnails(thumbs)) return;
  // Retry after a short delay — loadThumbnails may return null if plugin/store
  // isn't fully ready yet (race between event render and plugin initialization)
  if (retries > 0) {
    await new Promise((r) => setTimeout(r, 500));
    return triggerLoad(retries - 1);
  }
  // a running event gets its picture later; the store watcher fills it in
  thumbnailState.value = isActive.value ? 'loading' : 'empty';
}

function openCameraEvent(): void {
  if (longPress.consumesClick()) return;
  if (props.clickDisabled || !props.camera) return;

  // Active events near live edge → open live (no eventTimestamp)
  // Active events further in the past → open at event start (scrub)
  const isNearLive = isActive.value && Date.now() - props.event.startTime < LIVE_EDGE_MS;

  const desc = description.value;

  const headerAction = [
    {
      icon: SparklesIcon,
      toggle: true,
      onClick: () => {},
    },
  ];

  dialogInstance = dialog.openComponentDialog<CameraStreamEventProps>(CameraEventDialog, {
    data: {
      title: props.camera.name,
      dedupeKey: `camera-event:${props.camera._id}:${isNearLive ? 'live' : anchorTime.value}`,
      stayActive: true,
      hideCancelButton: true,
      hideConfirmButton: true,
      contentProps: {
        camera: props.camera,
        eventTimestamp: isNearLive ? undefined : anchorTime.value,
      },
      headerActions: desc ? headerAction : undefined,
      draggable: true,
      blockDragOnSelectors: ['.p-dialog-body'],
      dismissableMask: false,
      modal: false,
      dialogContentClass: '!px-0 h-full',
      goTo: `/cameras/${props.camera.name}${isNearLive ? '' : `?startTs=${anchorTime.value}`}`,
    },
    dialogSize: {
      desktop: {
        maxWidth: '800px',
        maxHeight: 'calc(100vh - max(1rem, var(--safe-area-inset-top)) - max(1rem, var(--safe-area-inset-bottom)))',
        width: '50vw',
      },
    },
  });
}

const { stop: stopObserver } = useIntersectionObserver(
  cardRef,
  ([entry]) => {
    if (entry.isIntersecting && !loadTriggered) {
      loadTriggered = true;
      stopObserver();
      triggerLoad();
    }
  },
  {
    threshold: 0.1,
  },
);

watch(
  () => eventStore.storeVersion.value,
  () => {
    if (!loadTriggered) return;
    const cached = eventStore.getCachedThumbnails(props.event.id);
    if (cached) applyThumbnails(cached);
  },
);

watch(
  () => props.event.state,
  (newState, oldState) => {
    if (oldState === 'active' && newState === 'ended') {
      triggerLoad();
    }
  },
);

watch(
  () => props.event.lastUpdate,
  () => {
    if (isActive.value && loadTriggered) {
      triggerLoad();
    }
  },
);

onMounted(() => {
  requestAnimationFrame(() => {
    if (!loadTriggered && cardRef.value) {
      const r = cardRef.value.getBoundingClientRect();
      if (r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight) {
        loadTriggered = true;
        stopObserver();
        triggerLoad();
      }
    }
  });
});

onUnmounted(() => {
  stopObserver();
  dialogInstance?.close();
});
</script>

<style scoped>
.camera-event-card {
  contain: layout;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
</style>
