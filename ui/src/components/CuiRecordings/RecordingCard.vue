<template>
  <div class="recording-card relative group cursor-pointer" @click="handleClick" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave">
    <div class="bg-neutral-900 w-full rounded-xl overflow-hidden relative" style="aspect-ratio: 1/1">
      <Skeleton v-if="thumbnailState === 'loading'" width="100%" height="100%" class="rounded-xl" />

      <CuiImage
        v-else-if="thumbnailUrl"
        :src="thumbnailUrl"
        :alt="displayCameraName"
        class="pointer-events-none w-full h-full transition-transform duration-300 group-hover:scale-105"
        :image-style="{ objectFit: 'cover' }"
        image-container-class="w-full h-full"
      />

      <div v-else class="w-full h-full flex items-center justify-center bg-neutral-800/80">
        <component :is="eventIcons[primaryType] ?? eventIcons.motion" class="w-10 h-10 text-white/20" />
      </div>

      <canvas v-if="preview" ref="previewCanvasRef" v-show="isPreviewActive" class="absolute inset-0 w-full h-full object-cover pointer-events-none z-[1]" />

      <div class="absolute inset-0 bg-transparent group-hover:bg-black/30 pointer-events-none transition-colors duration-200 z-[2]" />

      <div class="absolute top-0 left-0 right-0 p-2 bg-gradient-to-b from-black/80 to-transparent z-[3]">
        <div class="flex items-center gap-1.5">
          <AiBadge v-if="descriptionTitle" position="inline" />
          <p class="text-xs font-semibold text-white truncate min-w-0 flex-1">{{ displayCameraName }}</p>

          <span v-if="semanticDisplay" :class="['text-[10px] font-bold text-white px-1.5 py-0.5 rounded-md shrink-0', semanticDisplay.color]">
            {{ semanticDisplay.label }}
          </span>
          <Button
            v-if="canDownload"
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

      <div class="absolute bottom-2 left-2 flex items-center gap-1 z-[3]">
        <div v-for="type in displayTypes" :key="type" class="flex items-center justify-center w-5 h-5 rounded-md bg-black/60">
          <component :is="eventIcons[type] ?? eventIcons.motion" class="w-3 h-3 text-white/80" />
        </div>
        <span v-if="extraTypeCount > 0" class="text-[10px] text-white/60 font-medium">+{{ extraTypeCount }}</span>
        <span v-if="primaryLabel" class="text-[11px] text-white/80 font-medium truncate max-w-[100px]">
          {{ primaryLabel }}
        </span>
      </div>

      <div v-if="preview && isPreviewActive && preview.isLoading.value" class="absolute inset-0 z-[4] flex items-center justify-center pointer-events-none">
        <ProgressSpinner class="w-[28px] h-[28px] m-0" stroke-width="6" />
      </div>

      <div
        v-if="stripThumbnails.length > 1 && !thumbnailOverride"
        class="absolute bottom-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-[3]"
      >
        <div v-for="(thumb, i) in stripThumbnails.slice(0, 4)" :key="i" class="w-7 h-7 rounded overflow-hidden border border-white/20 bg-neutral-800">
          <img :src="thumb.url" :alt="thumb.type" decoding="async" loading="lazy" class="w-full h-full object-cover" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { EventHoverPreviewKey, getPrimaryThumbnailFromCache, thumbnailToUrl, useEventStore } from '@camera.ui/nvr';

import { extractErrorMessage } from '@/common/utils.js';
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

const CLIP_MIN = 0.15;
const CLIP_MAX = 0.38;
const DETECTION_PRIORITY = ['person', 'vehicle', 'animal', 'package'] as const;

const { icons: eventIcons } = resolveEventIcons();

const cachedInit = props.thumbnailOverride ? undefined : eventStore.getCachedThumbnails(props.event.id);
const initialState: 'loading' | 'loaded' | 'empty' = props.thumbnailOverride
  ? 'loaded'
  : cachedInit
    ? getPrimaryThumbnailFromCache(cachedInit, props.event).url
      ? 'loaded'
      : 'empty'
    : 'loading';

const preview = inject(EventHoverPreviewKey, undefined);
const previewCanvasRef = useTemplateRef('previewCanvasRef');
const isPreviewActive = ref(false);
const loadedThumbs = ref<EventThumbnails | null>(cachedInit ?? null);
const thumbnailState = ref<'loading' | 'loaded' | 'empty'>(initialState);
const isDownloading = ref(false);

const descriptionTitle = computed(() => props.event.segments?.find((s) => s?.description)?.description?.title);

const semanticDisplay = computed(() => {
  if (props.semanticScore == null) return undefined;
  const pct = Math.max(0, Math.min(1, (props.semanticScore - CLIP_MIN) / (CLIP_MAX - CLIP_MIN)));
  return {
    pct,
    label: `${(pct * 100).toFixed(0)}%`,
    color: pct >= 0.5 ? 'bg-green-500/80' : pct >= 0.25 ? 'bg-yellow-500/80' : 'bg-red-400/80',
  };
});

const primary = computed(() => {
  if (!loadedThumbs.value) return null;
  return getPrimaryThumbnailFromCache(loadedThumbs.value, props.event);
});

const thumbnailUrl = computed(() => props.thumbnailOverride?.url ?? primary.value?.url);
const primaryLabel = computed(() => (props.thumbnailOverride ? props.thumbnailOverride.label : primary.value?.label));
const primaryType = computed(() => props.thumbnailOverride?.type ?? primary.value?.type ?? props.event.types[0] ?? 'motion');

const uniqueTypes = computed(() => {
  // When ungrouped (thumbnailOverride), show only this thumbnail's type
  if (props.thumbnailOverride) return [props.thumbnailOverride.type].filter((t) => t !== 'motion' && t !== 'audio' && t !== 'scene');
  return [...new Set(props.event.types.filter((t) => t !== 'motion' && t !== 'audio'))];
});
const displayTypes = computed(() => uniqueTypes.value.slice(0, 2));
const extraTypeCount = computed(() => Math.max(0, uniqueTypes.value.length - 2));

const displayCameraName = computed(() => props.cameraName ?? props.event.cameraId);

const stripThumbnails = computed<{ url: string; type: string }[]>(() => {
  const thumbs = loadedThumbs.value;
  if (!thumbs) return [];

  const primaryUrl = primary.value?.url;
  const items: { url: string; type: string }[] = [];

  const addItem = (url: string | undefined, type: string): boolean => {
    if (!url || url === primaryUrl || items.length >= 5) return false;
    items.push({ url, type });
    return true;
  };

  // Attributes (faces, plates, classifications)
  if (thumbs.attributes) {
    for (const [key, data] of Object.entries(thumbs.attributes)) {
      addItem(thumbnailToUrl(data), key.split(':')[0]);
    }
  }

  // Detections by priority (keys are "{segIdx}:{label}")
  if (thumbs.detections) {
    for (const type of DETECTION_PRIORITY) {
      for (const [key, data] of Object.entries(thumbs.detections)) {
        if (key.endsWith(`:${type}`)) {
          addItem(thumbnailToUrl(data), type);
          break;
        }
      }
    }
    for (const [key, data] of Object.entries(thumbs.detections)) {
      const label = key.includes(':') ? key.split(':').slice(1).join(':') : key;
      if (!(DETECTION_PRIORITY as readonly string[]).includes(label)) {
        addItem(thumbnailToUrl(data), label);
      }
    }
  }

  // Scene (prefer segment 0)
  if (thumbs.scenes) {
    const sceneKeys = Object.keys(thumbs.scenes).sort((a, b) => Number(a) - Number(b));
    for (const sk of sceneKeys) {
      addItem(thumbnailToUrl(thumbs.scenes[sk]), 'scene');
    }
  }

  return items;
});

const formatDateTime = computed(() => {
  const date = new Date(props.event.startTime);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${dateStr} ${time}`;
});

const canDownload = computed(() => Boolean(nvrPluginRef.value && props.event.endTime));

function handleMouseEnter(): void {
  if (!preview || !props.event.endTime) return;
  const canvas = previewCanvasRef.value;
  if (!canvas) return;
  isPreviewActive.value = true;
  preview.onHoverStart(canvas, props.event.cameraId, props.event.id, props.event.startTime, props.event.endTime);
}

function handleMouseLeave(): void {
  if (!preview) return;
  isPreviewActive.value = false;
  preview.onHoverEnd();
}

async function triggerLoad(retries = 2): Promise<void> {
  const thumbs = await props.loadThumbnails(props.event.id, props.event.startTime);
  if (thumbs) {
    loadedThumbs.value = thumbs;
    const p = getPrimaryThumbnailFromCache(thumbs, props.event);
    thumbnailState.value = p.url ? 'loaded' : 'empty';
  } else if (retries > 0) {
    await new Promise((r) => setTimeout(r, 500));
    return triggerLoad(retries - 1);
  } else {
    thumbnailState.value = 'empty';
  }
}

function handleClick(): void {
  emit('scrollToEvent', props.event.startTime);
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

// Trigger thumbnail load as soon as the card mounts. The virtual scroller
// already limits the mounted set to what's in (or near) the viewport, so the
// IntersectionObserver-based lazy-load that used to live here is redundant
// and, worse, unreliable: during fast scrolls its initial check often fires
// with `isIntersecting: false` before layout settles, and it never fires
// again because the intersection doesn't *change* — leaving the card stuck
// in a skeleton state until the next scroll away-and-back.
onMounted(() => {
  if (initialState === 'loading') {
    triggerLoad();
  }
});
</script>

<style scoped>
.recording-card {
  contain: layout;
}
</style>
