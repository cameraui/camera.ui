<template>
  <div
    ref="cardRef"
    class="camera-event-card relative group cursor-pointer"
    @click.capture="closeForeignMenu"
    @click="openEpisode"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div class="bg-neutral-900 rounded-xl overflow-hidden relative" :class="fluid ? 'w-full aspect-square' : 'w-[140px] h-[140px]'">
      <div v-if="mosaicState === 'loading'" class="card-skeleton absolute inset-0 rounded-xl" />

      <CuiImage
        v-else-if="mosaicUrl"
        :src="mosaicUrl"
        :alt="episode.description?.title"
        class="pointer-events-none w-full h-full transition-transform duration-300 group-hover:scale-105"
        :image-style="{ objectFit: 'cover' }"
        image-container-class="w-full h-full"
      />

      <div v-else class="w-full h-full flex items-center justify-center bg-neutral-800/80">
        <i-tabler:route class="w-8 h-8 text-white/20" />
      </div>

      <canvas v-if="preview" ref="previewCanvasRef" v-show="isPreviewActive" class="absolute inset-0 w-full h-full object-cover pointer-events-none z-[1]" />

      <div v-if="fluid" class="absolute top-0 left-0 right-0 p-2 bg-gradient-to-b from-black/80 to-transparent z-[3]">
        <div class="flex items-center gap-1.5">
          <p class="text-xs font-semibold text-white truncate min-w-0 flex-1">{{ title }}</p>
          <button
            v-if="isAdmin && !clickDisabled"
            :title="isFavorite ? $t('views.recordings.unfavorite') : $t('views.recordings.favorite')"
            type="button"
            class="card-icon-button w-5 h-5 shrink-0"
            @click.stop="toggleFavorite"
            @mouseenter="stopPreview"
          >
            <i-tabler:star-filled v-if="isFavorite" class="w-3 h-3 text-yellow-400" />
            <i-tabler:star v-else class="w-3 h-3 text-white" />
          </button>
          <button
            v-if="!clickDisabled"
            :title="$t('views.recordings.more_actions')"
            type="button"
            class="card-icon-button w-5 h-5 shrink-0"
            :disabled="isDownloading"
            @click.stop="openCardMenu"
            @mouseenter="stopPreview"
          >
            <i-svg-spinners:ring-resize v-if="isDownloading" class="w-3 h-3 text-white" />
            <i-tabler:dots-vertical v-else class="w-3 h-3 text-white" />
          </button>
        </div>
        <p class="text-[10px] text-white/70">{{ formatTime }}</p>
      </div>

      <div
        v-else
        class="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex flex-col items-center justify-end gap-1 z-[2] pointer-events-none"
        :class="previewIndicator ? 'pb-8' : 'pb-2'"
      >
        <span class="text-xs text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 line-clamp-2 max-w-[130px] px-1 text-center">
          {{ episode.description?.title }}
        </span>
      </div>

      <div v-if="preview && isPreviewActive && preview.isLoading.value" class="absolute inset-0 z-[4] flex items-center justify-center pointer-events-none">
        <i-svg-spinners:ring-resize class="w-7 h-7 text-white" />
      </div>

      <div v-if="previewIndicator" class="absolute bottom-2 left-1/2 -translate-x-1/2 z-[4] pointer-events-none">
        <span class="text-[10px] font-semibold text-white bg-black/60 px-1.5 py-0.5 rounded-md whitespace-nowrap" style="font-variant-numeric: tabular-nums">
          {{ previewIndicator }}
        </span>
      </div>
    </div>

    <div v-if="!fluid" class="mt-2 text-center">
      <p class="text-xs text-muted">{{ formatTime }}</p>
    </div>

    <CuiMenu
      v-if="fluid && menuMounted"
      ref="cardMenuRef"
      :items="cardMenuItems"
      :popover="{
        pt: {
          content: {
            class: 'p-0! rounded-xl! overflow-hidden!',
          },
        },
      }"
    />
  </div>
</template>

<script setup lang="ts">
import { EventHoverPreviewKey, thumbnailToUrl, useEventStore } from '@camera.ui/nvr';
import DownloadIcon from '~icons/tabler/download';
import TraceIcon from '~icons/tabler/list-search';

import { closeOpenMenu } from '@/common/menuRegistry.js';
import { extractErrorMessage } from '@/common/utils.js';
import CuiMenu from '@/components/CuiMenu/CuiMenu.vue';

import type { MenuItem } from '@/components/CuiMenu/types.js';
import type { PreviewPart, RecordedEpisode } from '@camera.ui/nvr';
import type { PrivacyZone } from '@camera.ui/sdk';
import type { DBCamera } from '@shared/types';
import type { DynamicDialogInstance } from 'primevue/dynamicdialogoptions';

const props = defineProps<{
  episode: RecordedEpisode;
  cameraById: Map<string, DBCamera>;
  clickDisabled?: boolean;
  fluid?: boolean;
}>();

const log = useLogger();
const toast = useCuiToast();
const { t } = useI18n();
const { openEpisodePlayer } = useEpisodePlayerDialog();
const { openEpisodeTrace } = useEpisodeTraceDialog();
const { plugin: nvrPluginRef } = usePlugin('@camera.ui/camera-ui-nvr');
const eventStore = useEventStore('@camera.ui/camera-ui-nvr');
const preview = inject(EventHoverPreviewKey, undefined);

const cardRef = useTemplateRef<HTMLElement>('cardRef');
const previewCanvasRef = useTemplateRef<HTMLCanvasElement>('previewCanvasRef');
const cardMenuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('cardMenuRef');
const menuMounted = ref(false);
const mosaicUrl = ref<string | undefined>(undefined);
const mosaicState = ref<'loading' | 'loaded' | 'empty'>('loading');
const isDownloading = ref(false);
const isPreviewActive = ref(false);
const favoriteOverride = ref<boolean | null>(null);
const previewBlocked = ref(false);

const longPress = useLongPressPreview(
  cardRef,
  () => startPreview(),
  () => stopPreview(),
);

let dialogInstance: DynamicDialogInstance | undefined;
let loadTriggered = false;

const isAdmin = computed(() => hasPermission(undefined, 'admin'));
const isFavorite = computed(() => favoriteOverride.value ?? props.episode.favorite ?? false);

const title = computed(() => props.episode.description?.title ?? props.episode.group ?? '');

const previewParts = computed<PreviewPart[]>(() => {
  const blocks = (props.episode.blocks ?? []).filter((block) => !block.secondAngle);
  if (blocks.length > 0) return blocks.map((block) => ({ cameraId: block.cameraId, startMs: block.startMs, endMs: block.endMs }));
  return [...props.episode.members]
    .sort((a, b) => a.firstSeen - b.firstSeen)
    .map((member) => ({ cameraId: member.cameraId, startMs: member.firstSeen, endMs: member.lastSeen }));
});

const privacyByCamera = computed(() => {
  const map = new Map<string, PrivacyZone[]>();
  for (const part of previewParts.value) {
    const zones = props.cameraById.get(part.cameraId)?.zones?.privacy;
    if (zones?.length) map.set(part.cameraId, zones);
  }
  return map;
});

const cardMenuItems = computed<MenuItem[]>(() => [
  { key: 'trace', label: t('views.recordings.episode_trace.open'), icon: TraceIcon, onClick: () => openTrace() },
  { key: 'download', label: t('views.recordings.download'), icon: DownloadIcon, loading: isDownloading.value, onClick: () => handleDownload() },
]);

const previewIndicator = computed(() => {
  if (!preview) return '';
  if (previewBlocked.value) return t('views.recordings.no_preview');
  if (!isPreviewActive.value) return '';
  if (preview.status.value === 'unavailable') return t('views.recordings.no_preview');
  if (preview.status.value !== 'playing' || !preview.previewTimeMs.value) return '';
  const camera = props.cameraById.get(preview.previewCameraId.value)?.name;
  const clock = formatClock(preview.previewTimeMs.value);
  return camera ? `${camera} · ${clock}` : clock;
});

const formatTime = computed(() => {
  const date = new Date(props.episode.startTime);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
});

async function triggerLoad(retries = 3): Promise<void> {
  const mosaic = await eventStore.loadEpisodeMosaic(props.episode.id);
  if (mosaic) {
    mosaicUrl.value = thumbnailToUrl(mosaic);
    mosaicState.value = 'loaded';
    return;
  }
  if (retries > 0) {
    await new Promise((r) => setTimeout(r, 1000));
    return triggerLoad(retries - 1);
  }
  mosaicState.value = 'empty';
}

function closeForeignMenu(): void {
  closeOpenMenu(cardMenuRef.value?.hide);
}

function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function startPreview(): void {
  if (!preview) return;
  const canvas = previewCanvasRef.value;
  if (!canvas) return;
  if (previewParts.value.length === 0) {
    previewBlocked.value = true;
    return;
  }
  isPreviewActive.value = true;
  preview.onHoverStartSequence(canvas, `episode:${props.episode.id}`, previewParts.value, privacyByCamera.value);
}

function stopPreview(): void {
  previewBlocked.value = false;
  if (!preview || !isPreviewActive.value) return;
  isPreviewActive.value = false;
  preview.onHoverEnd();
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

function openEpisode(): void {
  if (longPress.consumesClick()) return;
  if (props.clickDisabled) return;
  dialogInstance = openEpisodePlayer(props.episode, props.cameraById);
}

async function openCardMenu(event: MouseEvent): Promise<void> {
  stopPreview();
  if (!menuMounted.value) {
    menuMounted.value = true;
    await nextTick();
  }
  cardMenuRef.value?.toggleMenu(event);
}

function openTrace(): void {
  openEpisodeTrace(props.episode, props.cameraById);
}

async function toggleFavorite(): Promise<void> {
  const next = !isFavorite.value;
  favoriteOverride.value = next;
  try {
    await eventStore.setEpisodeFavorite(props.episode.id, next);
  } catch (error) {
    favoriteOverride.value = null;
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 5000 });
  }
}

async function handleDownload(): Promise<void> {
  if (isDownloading.value) return;
  const nvrPlugin = nvrPluginRef.value as { nvrExportEpisode: (episodeID: string) => Promise<{ url: string; filename: string }> } | undefined;
  if (!nvrPlugin?.nvrExportEpisode) return;

  isDownloading.value = true;
  try {
    const result = await nvrPlugin.nvrExportEpisode(props.episode.id);
    await download({ url: result.url, filename: result.filename });
  } catch (error) {
    log.error('Episode download failed:', error);
    toast.add({ severity: 'error', summary: t('views.recordings.download_failed'), detail: extractErrorMessage(error), life: 5000 });
  } finally {
    isDownloading.value = false;
  }
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
  { threshold: 0.1 },
);

onUnmounted(() => {
  stopObserver();
  stopPreview();
  dialogInstance?.close();
});
</script>

<style scoped>
.card-icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 9999px;
  background: rgb(0 0 0 / 0.6);
  cursor: pointer;
}

.card-icon-button:hover {
  background: rgb(0 0 0 / 0.8);
}

.card-icon-button:disabled {
  cursor: default;
}

.card-skeleton {
  background: var(--p-skeleton-background, rgb(255 255 255 / 0.06));
  animation: card-skeleton-pulse 1.4s ease-in-out infinite;
}

@keyframes card-skeleton-pulse {
  50% {
    opacity: 0.55;
  }
}

.camera-event-card {
  contain: layout;
}
</style>
