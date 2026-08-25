<template>
  <div ref="rootRef" class="recording-card relative group cursor-pointer" @click="handleClick" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave">
    <div
      class="bg-neutral-900 w-full rounded-xl overflow-hidden relative transition-shadow duration-200"
      :class="{ 'ring-2 ring-inset ring-primary/70': siblingActive }"
      style="aspect-ratio: 1/1"
    >
      <Skeleton v-if="thumbnailState === 'loading'" width="100%" height="100%" class="rounded-xl" />

      <template v-else-if="displayUrl">
        <img v-if="cropShown" :src="displayUrl" aria-hidden="true" class="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-50 pointer-events-none" />
        <CuiImage
          :src="displayUrl"
          :alt="displayCameraName"
          class="pointer-events-none w-full h-full transition-transform duration-300 group-hover:scale-105"
          :image-style="{ objectFit: cropShown ? 'contain' : 'cover' }"
          image-container-class="w-full h-full"
        />
      </template>

      <div v-else class="w-full h-full flex items-center justify-center bg-neutral-800/80">
        <component :is="eventIcons[primaryType] ?? eventIcons.motion" class="w-10 h-10 text-white/20" />
      </div>

      <canvas v-if="preview" ref="previewCanvasRef" v-show="isPreviewActive" class="absolute inset-0 w-full h-full object-cover pointer-events-none z-[1]" />

      <div class="absolute inset-0 bg-transparent group-hover:bg-black/30 pointer-events-none transition-colors duration-200 z-[2]" />

      <div class="absolute top-0 left-0 right-0 p-2 bg-gradient-to-b from-black/80 to-transparent z-[3]">
        <div class="flex items-center gap-1.5">
          <AiBadge v-if="descriptionTitle" position="inline" />
          <p class="text-xs font-semibold text-white truncate min-w-0 flex-1">{{ displayCameraName }}</p>

          <span v-if="segPosition" class="text-[10px] font-semibold text-white/80 bg-black/60 px-1.5 py-0.5 rounded-md shrink-0">{{ segPosition }}</span>
          <span v-if="semanticDisplay" :class="['text-[10px] font-bold text-white px-1.5 py-0.5 rounded-md shrink-0', semanticDisplay.color]">
            {{ semanticDisplay.label }}
          </span>
          <Button
            v-if="memberEpisodeId && !selectionMode"
            v-tooltip.left="{ value: $t('views.recordings.open_episode') }"
            rounded
            text
            severity="secondary"
            class="!w-5 !h-5 !p-0 shrink-0 bg-black/60 hover:!bg-black/80"
            @click.stop="handleOpenEpisode"
          >
            <template #icon>
              <i-tabler:sparkles class="w-3 h-3 text-white" />
            </template>
          </Button>
          <Button
            v-if="canDownload && !selectionMode"
            v-tooltip.left="{ value: $t('views.recordings.download') }"
            rounded
            text
            severity="secondary"
            :loading="isDownloading"
            class="!w-5 !h-5 !p-0 shrink-0 bg-black/60 hover:!bg-black/80"
            @click.stop="handleDownload"
          >
            <template #icon>
              <i-tabler:download class="w-3 h-3 text-white" />
            </template>
          </Button>
        </div>
        <p class="text-[10px] text-white/70">{{ formatDateTime }}</p>
      </div>

      <template v-if="carouselImages.length > 1">
        <Button
          rounded
          text
          severity="secondary"
          class="carousel-nav !absolute left-1 top-1/2 -translate-y-1/2 z-[3] !w-7 !h-7 !p-0 bg-black/40 hover:!bg-black/60 transition-opacity duration-200"
          :aria-label="$t('views.recordings.prev_image')"
          @click.stop="stepImage(-1)"
          @mouseenter="stopPreview"
        >
          <template #icon>
            <i-mdi:chevron-left class="w-5 h-5 text-white" />
          </template>
        </Button>
        <Button
          rounded
          text
          severity="secondary"
          class="carousel-nav !absolute right-1 top-1/2 -translate-y-1/2 z-[3] !w-7 !h-7 !p-0 bg-black/40 hover:!bg-black/60 transition-opacity duration-200"
          :aria-label="$t('views.recordings.next_image')"
          @click.stop="stepImage(1)"
          @mouseenter="stopPreview"
        >
          <template #icon>
            <i-mdi:chevron-right class="w-5 h-5 text-white" />
          </template>
        </Button>
      </template>

      <div v-if="footerLabel" class="absolute bottom-10 left-1/2 -translate-x-1/2 z-[3] max-w-[85%] pointer-events-none">
        <span class="block text-[11px] text-white font-medium truncate bg-black/50 rounded-md px-2 py-0.5">{{ footerLabel }}</span>
      </div>

      <div ref="footerRef" class="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 z-[3]">
        <div class="flex items-center gap-1 min-w-0">
          <div
            v-if="selectionMode"
            class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors shrink-0"
            :class="selected ? 'bg-primary border-primary' : 'bg-black/40 border-white/80'"
          >
            <i-mdi:check v-if="selected" class="w-4 h-4 text-white" />
          </div>
          <div v-for="type in displayTypes" :key="type" class="flex items-center justify-center w-5 h-5 rounded-md bg-black/60 shrink-0">
            <component :is="eventIcons[type] ?? eventIcons.motion" class="w-3 h-3 text-white/80" />
          </div>
          <span v-if="hiddenTypes.length > 0" :title="hiddenTypes.join(', ')" class="text-[10px] text-white/60 font-medium shrink-0"> +{{ hiddenTypes.length }} </span>
        </div>

        <div
          v-if="visibleThumbnails.length > 0 || hiddenThumbnailCount > 0"
          class="flex items-center gap-0.5 shrink-0 opacity-85 group-hover:opacity-100 transition-opacity duration-200"
        >
          <div
            v-for="(thumb, i) in visibleThumbnails"
            :key="i"
            class="w-7 h-7 rounded overflow-hidden border bg-neutral-800 cursor-pointer"
            :class="i === activeImageIndex ? 'border-primary/80' : 'border-white/20'"
            @click="onTileClick(i, $event)"
          >
            <img :src="thumb.url" :alt="thumb.type" decoding="async" loading="lazy" class="w-full h-full object-cover" />
          </div>
          <span v-if="hiddenThumbnailCount > 0" class="text-[10px] text-white/60 font-medium">+{{ hiddenThumbnailCount }}</span>
        </div>
      </div>

      <div v-if="preview && isPreviewActive && preview.isLoading.value" class="absolute inset-0 z-[4] flex items-center justify-center pointer-events-none">
        <ProgressSpinner class="w-[28px] h-[28px] m-0" stroke-width="6" />
      </div>

      <div v-if="previewIndicator" class="absolute bottom-2 left-1/2 -translate-x-1/2 z-[4] pointer-events-none">
        <span class="text-[10px] font-semibold text-white bg-black/60 px-1.5 py-0.5 rounded-md whitespace-nowrap" style="font-variant-numeric: tabular-nums">
          {{ previewIndicator }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  attributeThumbnails,
  EventHoverPreviewKey,
  previewFocusTrack,
  previewPlayableEnd,
  resolveThumbnail,
  segmentTypes,
  thumbnailToUrl,
  useEventStore,
} from '@camera.ui/nvr';

import { extractErrorMessage } from '@/common/utils.js';
import { eventAnchorTime, segmentLabel } from '@/utils/eventAnchor.js';
import { resolveEventIcons } from '@/utils/eventIcons.js';

import type { EventThumbnails } from '@camera.ui/nvr';
import type { RecordingCardEmits, RecordingCardProps } from './types.js';

const props = defineProps<RecordingCardProps>();

const emit = defineEmits<RecordingCardEmits>();

const log = useLogger();
const toast = useCuiToast();
const { t } = useI18n();
const eventStore = useEventStore('@camera.ui/camera-ui-nvr');
const { plugin: nvrPluginRef } = usePlugin('@camera.ui/camera-ui-nvr');

const ICON_PX = 24;
const TILE_PX = 30;
const MORE_PX = 22;
const CHECKBOX_PX = 28;
const GROUP_GAP_PX = 8;

const { icons: eventIcons } = resolveEventIcons();

const cachedInit = eventStore.getCachedThumbnails(props.event.id);
const initialState: 'loading' | 'loaded' | 'empty' = cachedInit
  ? resolveThumbnail(cachedInit, props.event, 'card', props.segIndex).url
    ? 'loaded'
    : 'empty'
  : 'loading';

const preview = inject(EventHoverPreviewKey, undefined);
const rootRef = useTemplateRef<HTMLElement>('rootRef');
const previewCanvasRef = useTemplateRef('previewCanvasRef');
const footerRef = useTemplateRef<HTMLElement>('footerRef');
const previewBlocked = ref(false);

const longPress = useLongPressPreview(
  rootRef,
  () => startPreview(),
  () => stopPreview(),
);
const isPreviewActive = ref(false);
const loadedThumbs = ref<EventThumbnails | null>(cachedInit ?? null);
const thumbnailState = ref<'loading' | 'loaded' | 'empty'>(initialState);
const isDownloading = ref(false);
const activeImageIndexRaw = ref(0);

const { width: footerWidth } = useElementSize(footerRef);

const descriptionTitle = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  eventStore.storeVersion.value;
  return props.event.segments?.find((s) => s?.description)?.description?.title;
});

const memberEpisodeId = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  eventStore.storeVersion.value;
  return props.event.episodeIds?.[0];
});

const semanticDisplay = computed(() => {
  if (props.semanticScore == null) return undefined;
  const pct = Math.max(0, Math.min(1, props.semanticScore));
  return {
    pct,
    label: `${(pct * 100).toFixed(0)}%`,
    color: pct >= 0.5 ? 'bg-green-500/80' : pct >= 0.25 ? 'bg-yellow-500/80' : 'bg-red-400/80',
  };
});

const primary = computed(() => {
  if (!loadedThumbs.value) return null;
  return resolveThumbnail(loadedThumbs.value, props.event, 'card', props.segIndex);
});

const shownSegment = computed(() => {
  const index = props.segIndex ?? primary.value?.segIndex;
  return index === undefined ? undefined : props.event.segments?.[index];
});

const thumbnailUrl = computed(() => primary.value?.url);
const primaryLabel = computed(() => primary.value?.label);
const primaryType = computed(() => primary.value?.type ?? props.event.types[0] ?? 'motion');

const segPosition = computed(() => {
  if (props.hideSegmentBadge) return undefined;
  const count = props.event.segments?.length ?? 0;
  return props.segIndex !== undefined && count > 1 ? `${props.segIndex + 1}/${count}` : undefined;
});

const carouselImages = computed<{ url: string; label?: string; type: string; crop: boolean }[]>(() => {
  const thumbs = loadedThumbs.value;
  const sceneUrl = primary.value?.url;
  if (!thumbs || !sceneUrl) return [];

  const items = [{ url: sceneUrl, label: primary.value?.label, type: primaryType.value, crop: false }];
  for (const tile of attributeThumbnails(thumbs, props.segIndex)) {
    if (items.some((item) => item.url === tile.url)) continue;
    items.push({ url: tile.url, label: tile.label, type: tile.type, crop: true });
  }
  if (props.segIndex === undefined) {
    for (const key of Object.keys(thumbs.cards ?? thumbs.strips ?? {}).sort((a, b) => Number(a) - Number(b))) {
      const url = thumbnailToUrl(thumbs.cards?.[key] ?? thumbs.strips?.[key]);
      if (!url || items.some((item) => item.url === url)) continue;
      const label = segmentLabel(props.event, key);
      items.push({ url, label, type: label, crop: false });
    }
  }
  return items.length > 1 ? items : [];
});

const carouselActive = computed(() => carouselImages.value.length > 1);
const activeImageIndex = computed(() => (carouselImages.value.length ? Math.min(activeImageIndexRaw.value, carouselImages.value.length - 1) : 0));
const activeImage = computed(() => (carouselActive.value ? carouselImages.value[activeImageIndex.value] : undefined));
const cropShown = computed(() => Boolean(activeImage.value?.crop));
const displayUrl = computed(() => activeImage.value?.url ?? thumbnailUrl.value);
const footerLabel = computed(() => activeImage.value?.label ?? primaryLabel.value);

const uniqueTypes = computed(() => {
  const segment = shownSegment.value;
  const types = segment ? segmentTypes(props.event, segment) : [...new Set(props.event.types)];
  return types.filter((t: string) => t !== 'motion' && t !== 'audio');
});

const displayCameraName = computed(() => props.cameraName ?? props.event.cameraId);

const stripThumbnails = computed<{ url: string; type: string }[]>(() => carouselImages.value.map((img) => ({ url: img.url, type: img.type })));

const displayTypes = computed(() => uniqueTypes.value.slice(0, footerLayout.value.icons));

const footerLayout = computed(() => {
  const width = footerWidth.value;
  if (!width) return { icons: 2, tiles: 2 };

  let free = width - GROUP_GAP_PX;
  if (props.selectionMode) free -= CHECKBOX_PX;

  const tileFloor = stripThumbnails.value.length > 0 ? TILE_PX + MORE_PX : 0;
  const fitted = fitCount(uniqueTypes.value.length, Math.max(0, free - tileFloor), ICON_PX);
  const icons = uniqueTypes.value.length > 0 ? Math.max(1, fitted) : 0;
  const iconsPx = icons * ICON_PX + (icons < uniqueTypes.value.length ? MORE_PX : 0);
  const tiles = fitCount(stripThumbnails.value.length, Math.max(0, free - iconsPx), TILE_PX);

  return { icons, tiles };
});

const hiddenTypes = computed(() => uniqueTypes.value.slice(footerLayout.value.icons));
const visibleThumbnails = computed(() => stripThumbnails.value.slice(0, footerLayout.value.tiles));
const hiddenThumbnailCount = computed(() => stripThumbnails.value.length - footerLayout.value.tiles);

const formatDateTime = computed(() => {
  // label with the moment the card pictures: the segment's own start on
  // segment cards, the thumbnail moment on event cards (matches the sort key)
  const segStart = props.segIndex !== undefined ? props.event.segments?.[props.segIndex]?.firstSeen : undefined;
  const date = new Date(segStart ?? props.event.thumbnailAt ?? props.event.startTime);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${dateStr} ${time}`;
});

const canDownload = computed(() => Boolean(nvrPluginRef.value && props.event.endTime && props.event.hasRecording !== false));

const previewIndicator = computed(() => {
  if (!preview) return '';
  if (previewBlocked.value) return t('views.recordings.no_preview');
  if (!isPreviewActive.value) return '';
  if (preview.status.value === 'unavailable') return t('views.recordings.no_preview');
  if (preview.status.value === 'playing' && preview.previewTimeMs.value) return formatClock(preview.previewTimeMs.value);
  return '';
});

function fitCount(total: number, space: number, itemPx: number): number {
  if (total === 0 || space < itemPx) return 0;
  if (total * itemPx <= space) return total;
  return Math.max(0, Math.floor((space - MORE_PX) / itemPx));
}

function stepImage(delta: number): void {
  const len = carouselImages.value.length;
  if (!len) return;
  stopPreview();
  activeImageIndexRaw.value = (activeImageIndex.value + delta + len) % len;
}

function onTileClick(index: number, event: MouseEvent): void {
  if (!carouselActive.value) return;
  event.stopPropagation();
  stopPreview();
  activeImageIndexRaw.value = index;
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
  const to = previewPlayableEnd(props.event);
  if (props.event.hasRecording === false || !to) {
    previewBlocked.value = true;
    return;
  }
  isPreviewActive.value = true;
  preview.onHoverStart(canvas, props.event.cameraId, props.event.id, props.event.startTime, to, props.camera?.zones?.privacy, previewFocusTrack(props.event));
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

async function triggerLoad(retries = 2): Promise<void> {
  const thumbs = await props.loadThumbnails(props.event.id, props.event.startTime);
  if (thumbs) {
    loadedThumbs.value = thumbs;
    const p = resolveThumbnail(thumbs, props.event, 'card');
    thumbnailState.value = p.url ? 'loaded' : 'empty';
  } else if (retries > 0) {
    await new Promise((r) => setTimeout(r, 500));
    return triggerLoad(retries - 1);
  } else {
    thumbnailState.value = props.event.state === 'active' ? 'loading' : 'empty';
  }
}

function handleOpenEpisode(): void {
  if (memberEpisodeId.value) emit('openEpisode', memberEpisodeId.value);
}

function handleClick(): void {
  if (longPress.consumesClick()) return;
  if (props.selectionMode) {
    emit('select');
    return;
  }
  emit('scrollToEvent', shownSegment.value?.firstSeen ?? eventAnchorTime(props.event));
}

async function handleDownload(): Promise<void> {
  if (isDownloading.value) return;
  const nvrPlugin = nvrPluginRef.value as { nvrExport: (...args: any[]) => Promise<{ url: string; filename: string }> } | undefined;
  if (!nvrPlugin?.nvrExport || !props.event.endTime) return;

  isDownloading.value = true;
  try {
    const result = await nvrPlugin.nvrExport(
      props.event.cameraId,
      props.event.startTime * 1000, // ms → μs
      props.event.endTime * 1000,
    );
    await download({ url: result.url, filename: result.filename });
  } catch (error) {
    log.error('Download failed:', error);
    toast.add({ severity: 'error', summary: t('views.recordings.download_failed'), detail: extractErrorMessage(error), life: 5000 });
  } finally {
    isDownloading.value = false;
  }
}

watch(
  () => eventStore.storeVersion.value,
  () => {
    const cached = eventStore.getCachedThumbnails(props.event.id);
    if (!cached) return;
    loadedThumbs.value = cached;
    if (resolveThumbnail(cached, props.event, 'card').url) thumbnailState.value = 'loaded';
  },
);

onMounted(() => {
  if (initialState === 'loading') {
    triggerLoad();
  }
});
</script>

<style scoped>
.recording-card {
  contain: layout;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}

@media (hover: hover) and (pointer: fine) {
  .carousel-nav {
    opacity: 0;
  }
  .recording-card:hover .carousel-nav,
  .recording-card:focus-within .carousel-nav {
    opacity: 1;
  }
}
</style>
