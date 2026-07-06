<template>
  <div ref="cardRef" class="camera-event-card relative group cursor-pointer" @click="openCameraEvent" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave">
    <AiBadge v-if="descriptionTitle" />

    <div class="bg-neutral-900 w-[140px] h-[140px] rounded-xl overflow-hidden relative">
      <Skeleton v-if="thumbnailState === 'loading'" class="w-full h-full rounded-xl" width="140px" height="140px" />

      <CuiImage
        v-else-if="thumbnailUrl"
        :src="thumbnailUrl"
        :alt="props.cameraName"
        class="pointer-events-none w-full h-full transition-transform duration-300 group-hover:scale-105"
        :image-style="{ objectFit: 'cover' }"
        width="140px"
        height="140px"
        image-container-class="w-full h-full"
      />

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

      <div v-if="isActive" class="absolute top-1.5 left-1.5 z-[3] flex items-center gap-1">
        <span class="relative flex h-2.5 w-2.5">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
        </span>
      </div>

      <div
        v-if="thumbnailUrl"
        class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex flex-col items-center justify-end pb-2 gap-1 z-[2] pointer-events-none"
      >
        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <component :is="typeIcon" class="w-3.5 h-3.5 text-white/50" />
          <span v-if="thumbnailLabel" class="text-[10px] text-white/50 font-medium truncate max-w-[100px]">
            {{ thumbnailLabel }}
          </span>
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
import { EventHoverPreviewKey, getPrimaryThumbnailFromCache, getPrimaryType } from '@camera.ui/nvr';
import SparklesIcon from '~icons/tabler/sparkles';

import CameraEventDialog from '@/components/CuiDialog/templates/CameraStreamEvent/CameraStreamEvent.vue';
import { resolveEventIcons } from '@/utils/eventIcons.js';

import type { CameraStreamEventProps } from '@/components/CuiDialog/templates/CameraStreamEvent/types.js';
import type { DynamicDialogInstance } from 'primevue/dynamicdialogoptions';
import type { CameraEventProps } from './types.js';

const props = defineProps<CameraEventProps>();

const dialog = useCuiDialog();
const preview = inject(EventHoverPreviewKey, undefined);

// Live edge threshold — events starting within this window open as live stream.
const LIVE_EDGE_MS = 10_000;

const previewCanvasRef = useTemplateRef('previewCanvasRef');
const cardRef = useTemplateRef('cardRef');
const isPreviewActive = ref(false);
const thumbnailUrl = ref<string | undefined>(undefined);
const thumbnailLabel = ref<string | undefined>(undefined);
const thumbnailType = ref(getPrimaryType(props.event));
const thumbnailState = ref<'loading' | 'loaded' | 'empty'>('loading');

let dialogInstance: DynamicDialogInstance | undefined;
let loadTriggered = false;

const { icons: eventIcons, generic: genericIcon } = resolveEventIcons();

const typeIcon = computed<Component>(() => eventIcons[thumbnailType.value] ?? genericIcon);

const formatTime = computed(() => {
  const date = new Date(props.event.startTime);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
});

const isActive = computed(() => props.event.state === 'active');
const hasDescription = computed(() => !isActive.value && props.event.segments?.some((s) => s?.description));
const descriptionTitle = computed(() => props.event.segments?.find((s) => s?.description)?.description?.title);

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
    const primary = getPrimaryThumbnailFromCache(thumbs, props.event);
    if (primary.url) {
      thumbnailUrl.value = primary.url;
      thumbnailLabel.value = primary.label;
      thumbnailType.value = primary.type;
      thumbnailState.value = 'loaded';
      return;
    }
  }
  // Retry after a short delay — loadThumbnails may return null if plugin/store
  // isn't fully ready yet (race between event render and plugin initialization)
  if (retries > 0) {
    await new Promise((r) => setTimeout(r, 500));
    return triggerLoad(retries - 1);
  }
  thumbnailState.value = 'empty';
}

function openCameraEvent(): void {
  if (props.clickDisabled || !props.camera) return;

  // Active events near live edge → open live (no eventTimestamp)
  // Active events further in the past → open at event start (scrub)
  const isNearLive = isActive.value && Date.now() - props.event.startTime < LIVE_EDGE_MS;

  const desc = props.event.segments?.find((s) => s?.description)?.description;

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
      stayActive: true,
      hideCancelButton: true,
      hideConfirmButton: true,
      contentProps: {
        camera: props.camera,
        eventTimestamp: isNearLive ? undefined : props.event.startTime,
      },
      headerActions: desc ? headerAction : undefined,
      draggable: true,
      blockDragOnSelectors: ['.p-dialog-body'],
      dismissableMask: false,
      modal: false,
      dialogContentClass: '!px-0 h-full',
      goTo: `/cameras/${props.camera.name}${isNearLive ? '' : `?startTs=${props.event.startTime}`}`,
    },
    dialogSize: {
      desktop: {
        maxWidth: '800px',
        maxHeight: 'calc(100vh - max(1rem, env(safe-area-inset-top, 0px)) - max(1rem, env(safe-area-inset-bottom, 0px)))',
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
}
</style>
