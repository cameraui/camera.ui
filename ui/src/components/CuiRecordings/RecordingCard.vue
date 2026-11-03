<template>
  <div
    ref="rootRef"
    class="recording-card relative group cursor-pointer"
    @click.capture="closeForeignMenu"
    @click="handleClick"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div
      class="bg-neutral-900 w-full rounded-xl overflow-hidden relative transition-shadow duration-200"
      :class="{ 'ring-2 ring-inset ring-primary/70': siblingActive }"
      style="aspect-ratio: 1/1"
    >
      <div v-if="thumbnailState === 'loading'" class="card-skeleton absolute inset-0 rounded-xl" />

      <template v-else-if="displayUrl">
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
          <p class="text-xs font-semibold text-white truncate min-w-0 flex-1">{{ displayCameraName }}</p>

          <span v-if="segPosition" class="text-[10px] font-semibold text-white/80 bg-black/60 px-1.5 py-0.5 rounded-md shrink-0">{{ segPosition }}</span>
          <span v-if="semanticDisplay" :class="['text-[10px] font-bold text-white px-1.5 py-0.5 rounded-md shrink-0', semanticDisplay.color]">
            {{ semanticDisplay.label }}
          </span>
          <button
            v-if="isAdmin && !selectionMode"
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
            v-if="cardMenuItems.length > 0 && !selectionMode"
            :title="$t('views.recordings.more_actions')"
            type="button"
            class="card-icon-button w-5 h-5 shrink-0"
            :disabled="isDownloading || reassignBusy || deleteBusy"
            @click.stop="openCardMenu"
            @mouseenter="stopPreview"
          >
            <i-svg-spinners:ring-resize v-if="isDownloading || reassignBusy || deleteBusy" class="w-3 h-3 text-white" />
            <i-tabler:dots-vertical v-else class="w-3 h-3 text-white" />
          </button>
        </div>
        <p class="text-[10px] text-white/70">{{ formatDateTime }}</p>
      </div>

      <template v-if="carouselImages.length > 1">
        <button
          type="button"
          class="card-icon-button carousel-nav absolute left-1 top-1/2 -translate-y-1/2 z-[3] w-7 h-7 transition-opacity duration-200"
          :aria-label="$t('views.recordings.prev_image')"
          @click.stop="stepImage(-1)"
          @mouseenter="stopPreview"
        >
          <i-mdi:chevron-left class="w-5 h-5 text-white" />
        </button>
        <button
          type="button"
          class="card-icon-button carousel-nav absolute right-1 top-1/2 -translate-y-1/2 z-[3] w-7 h-7 transition-opacity duration-200"
          :aria-label="$t('views.recordings.next_image')"
          @click.stop="stepImage(1)"
          @mouseenter="stopPreview"
        >
          <i-mdi:chevron-right class="w-5 h-5 text-white" />
        </button>
      </template>

      <div
        v-if="footerLabel"
        class="absolute left-1/2 -translate-x-1/2 z-[3] max-w-[85%] pointer-events-none transition-all duration-200"
        :class="previewIndicator ? 'bottom-16' : 'bottom-10'"
      >
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
        <i-svg-spinners:ring-resize class="w-7 h-7 text-white" />
      </div>

      <div v-if="previewIndicator" class="absolute bottom-10 left-1/2 -translate-x-1/2 z-[4] pointer-events-none">
        <span class="text-[10px] font-semibold text-white bg-black/60 px-1.5 py-0.5 rounded-md whitespace-nowrap" style="font-variant-numeric: tabular-nums">
          {{ previewIndicator }}
        </span>
      </div>
    </div>

    <CuiMenu
      v-if="overlays.menu"
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
import {
  attributeThumbnails,
  EventHoverPreviewKey,
  previewFocusTrack,
  previewPlayableEnd,
  resolveThumbnail,
  segmentTypes,
  thumbnailToUrl,
  useEventPictures,
  useEventStore,
  useFaceActions,
  useRecordingExport,
} from '@camera.ui/nvr';
import DeleteIcon from '~icons/mdi/delete-outline';
import DeleteRecordingIcon from '~icons/mdi/movie-remove-outline';
import AssistantIcon from '~icons/mdi/robot-outline';
import DownloadIcon from '~icons/tabler/download';
import TraceIcon from '~icons/tabler/list-search';
import FaceEditIcon from '~icons/tabler/user-edit';

import { closeOpenMenu } from '@/common/menuRegistry.js';
import { extractErrorMessage, formatCardTime } from '@/common/utils.js';
import FaceReassignDialog from '@/components/CuiDialog/templates/FaceReassign/FaceReassign.vue';
import CuiMenu from '@/components/CuiMenu/CuiMenu.vue';
import { eventAnchorTime, segmentLabel } from '@/utils/eventAnchor.js';
import { resolveEventIcons } from '@/utils/eventIcons.js';

import type { FaceReassignProps } from '@/components/CuiDialog/templates/FaceReassign/types.js';
import type { MenuItem } from '@/components/CuiMenu/types.js';
import type { FaceTarget, RecordingCardEmits, RecordingCardProps } from './types.js';

const props = defineProps<RecordingCardProps>();

const emit = defineEmits<RecordingCardEmits>();

const log = useLogger();
const toast = useCuiToast();
const { t } = useI18n();
const router = useRouter();
const eventStore = useEventStore();
const { exportRange } = useRecordingExport();
const { reassignEventFace } = useFaceActions();
const dialog = useCuiDialog();
const { mounted: overlays, toggleOverlay } = useLazyOverlays<'menu'>();
const { pictures, state: pictureState } = useEventPictures(
  () => props.event,
  () => [
    { kind: 'cover', segIndex: props.segIndex },
    { kind: 'tiles', segIndex: props.segIndex },
  ],
);

const ICON_PX = 24;
const TILE_PX = 30;
const MORE_PX = 22;
const CHECKBOX_PX = 28;
const GROUP_GAP_PX = 8;
const FOOTER_STEP_PX = 8;
const EVENT_FOOTAGE_PAD_MS = 30_000;

const { icons: eventIcons } = resolveEventIcons();

const preview = inject(EventHoverPreviewKey, undefined);
const rootRef = useTemplateRef<HTMLElement>('rootRef');
const previewCanvasRef = useTemplateRef('previewCanvasRef');
const footerRef = useTemplateRef<HTMLElement>('footerRef');
const cardMenuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('cardMenuRef');
const previewBlocked = ref(false);

const longPress = useLongPressPreview(
  rootRef,
  () => startPreview(true),
  () => stopPreview(),
);
const isPreviewActive = ref(false);
const isDownloading = ref(false);
const activeImageIndexRaw = ref(0);
const favoriteOverride = ref<boolean | null>(null);
const reassignBusy = ref(false);
const deleteBusy = ref(false);
const focusFace = ref<FaceTarget>();
const footerWidth = ref(0);

const isAdmin = computed(() => hasPermission(undefined, 'admin'));
const isFavorite = computed(() => favoriteOverride.value ?? props.event.favorite ?? false);

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
  if (!pictures.value) return null;
  return resolveThumbnail(pictures.value, props.event, 'card', props.segIndex);
});

const shownSegment = computed(() => {
  const index = props.segIndex ?? primary.value?.segIndex;
  return index === undefined ? undefined : props.event.segments?.[index];
});

const thumbnailUrl = computed(() => primary.value?.url);
const thumbnailState = computed(() => {
  if (thumbnailUrl.value) return 'loaded';
  return pictureState.value === 'loading' || props.event.state === 'active' ? 'loading' : 'empty';
});
const primaryLabel = computed(() => primary.value?.label);
const primaryType = computed(() => primary.value?.type ?? props.event.types[0] ?? 'motion');

const segPosition = computed(() => {
  if (props.hideSegmentBadge) return undefined;
  const count = props.event.segments?.length ?? 0;
  return props.segIndex !== undefined && count > 1 ? `${props.segIndex + 1}/${count}` : undefined;
});

const carouselImages = computed<{ url: string; label?: string; type: string; crop: boolean; faceSeg?: number; attrIndex?: number }[]>(() => {
  const thumbs = pictures.value;
  const sceneUrl = primary.value?.url;
  if (!thumbs || !sceneUrl) return [];

  const items: { url: string; label?: string; type: string; crop: boolean; faceSeg?: number; attrIndex?: number }[] = [
    { url: sceneUrl, label: primary.value?.label, type: primaryType.value, crop: false },
  ];
  for (const tile of attributeThumbnails(thumbs, props.segIndex, props.event)) {
    if (items.some((item) => item.url === tile.url)) continue;
    items.push({ url: tile.url, label: tile.label, type: tile.type, crop: true, faceSeg: tile.seg ?? -1, attrIndex: tile.attrIndex });
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

const formatDateTime = computed(() => formatCardTime(shownSegment.value?.firstSeen ?? props.event.thumbnailAt ?? props.event.startTime));

const canDownload = computed(() => Boolean(eventStore.isAvailable.value && props.event.endTime && props.event.hasRecording !== false));
const canDeleteEvent = computed(() => Boolean(isAdmin.value && eventStore.isAvailable.value && props.event.state === 'ended'));
const canDeleteRecording = computed(() => canDeleteEvent.value && canDownload.value);

const previewIndicator = computed(() => {
  if (!preview) return '';
  if (previewBlocked.value) return t('views.recordings.no_preview');
  if (!isPreviewActive.value) return '';
  if (preview.status.value === 'unavailable') return t('views.recordings.no_preview');
  if (preview.status.value === 'playing' && preview.previewTimeMs.value) return formatClock(preview.previewTimeMs.value);
  return '';
});

const faceTarget = computed<FaceTarget | undefined>(() => {
  const img = activeImage.value;
  if (img?.crop) return img.type === 'face' ? { seg: img.faceSeg ?? -1, label: img.label || 'unknown', attrIndex: img.attrIndex } : undefined;
  const seg = props.segIndex ?? primary.value?.segIndex;
  if (activeImageIndex.value > 0 || seg === undefined) return undefined;
  const attributes = shownSegment.value?.attributes ?? [];
  const faces = attributes.flatMap((attribute, index) => (attribute.type === 'face' && !attribute.unlisted ? [index] : []));
  return faces.length === 1 ? { seg, label: attributes[faces[0]].label || 'unknown', attrIndex: faces[0] } : undefined;
});

const cardMenuItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = [];
  if (isAdmin.value && faceTarget.value) {
    items.push({
      key: 'reassign',
      label: t('views.recordings.reassign_face'),
      icon: FaceEditIcon,
      loading: reassignBusy.value,
      onClick: () => openFaceReassignDialog(),
    });
  }
  if (isAdmin.value && props.camera) {
    items.push({ key: 'trace', label: t('views.recordings.open_trace'), icon: TraceIcon, onClick: () => emit('openTrace', shownSegment.value?.firstSeen) });
  }
  items.push({ key: 'ask', label: t('views.recordings.ask_assistant'), icon: AssistantIcon, onClick: () => askAssistant() });
  if (canDownload.value) {
    items.push({
      key: 'download',
      label: t('views.recordings.download'),
      icon: DownloadIcon,
      loading: isDownloading.value,
      onClick: () => handleDownload(),
    });
  }
  if (canDeleteEvent.value) {
    items.push({
      key: 'delete_event',
      label: t('views.recordings.delete_event'),
      icon: DeleteIcon,
      iconProps: { class: 'text-red-500' },
      labelProps: { class: 'text-red-500' },
      buttonProps: { severity: 'danger' },
      loading: deleteBusy.value,
      onClick: () => confirmDelete(t('views.recordings.delete_event_confirm'), deleteEvent),
    });
  }
  if (canDeleteRecording.value) {
    items.push({
      key: 'delete_recording',
      label: t('views.recordings.delete_recording'),
      icon: DeleteRecordingIcon,
      iconProps: { class: 'text-red-500' },
      labelProps: { class: 'text-red-500' },
      buttonProps: { severity: 'danger' },
      loading: deleteBusy.value,
      onClick: () => confirmDelete(t('views.recordings.delete_recording_confirm'), deleteRecording),
    });
  }
  return items;
});

function closeForeignMenu(): void {
  closeOpenMenu(cardMenuRef.value?.hide);
}

function askAssistant(): void {
  const prompt = t('views.recordings.ask_assistant_prompt', {
    camera: props.cameraName ?? props.camera?.name ?? props.event.cameraId,
    time: new Date(props.event.startTime).toLocaleString(),
    id: props.event.id,
  });
  router.push({ path: '/assistant', query: { prompt } });
}

function fitCount(total: number, space: number, itemPx: number): number {
  if (total === 0 || space < itemPx) return 0;
  if (total * itemPx <= space) return total;
  return Math.max(0, Math.floor((space - MORE_PX) / itemPx));
}

function stepImage(delta: number): void {
  const len = carouselImages.value.length;
  if (!len) return;
  stopPreview();
  focusFace.value = undefined;
  activeImageIndexRaw.value = (activeImageIndex.value + delta + len) % len;
}

function onTileClick(index: number, event: MouseEvent): void {
  if (!carouselActive.value) return;
  event.stopPropagation();
  stopPreview();
  focusFace.value = undefined;
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

function startPreview(immediate = false): void {
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
  preview.onHoverStart(canvas, props.event.cameraId, props.event.id, props.event.startTime, to, props.camera?.zones?.privacy, previewFocusTrack(props.event), {
    immediate,
  });
}

function handleMouseEnter(): void {
  emit('segmentHover', props.segIndex !== undefined ? props.event.id : null);
  if (longPress.blocksMouseEnter()) return;
  startPreview();
}

function handleMouseLeave(): void {
  emit('segmentHover', null);
  previewBlocked.value = false;
  if (!preview) return;
  isPreviewActive.value = false;
  preview.onHoverEnd();
}

function handleClick(): void {
  if (longPress.consumesClick()) return;
  if (props.selectionMode) {
    emit('select');
    return;
  }
  emit('scrollToEvent', shownSegment.value?.firstSeen ?? eventAnchorTime(props.event));
}

async function openCardMenu(event: MouseEvent): Promise<void> {
  stopPreview();
  await toggleOverlay('menu', () => cardMenuRef.value?.toggleMenu(event));
}

function openFaceReassignDialog(): void {
  const target = faceTarget.value;
  if (!target) return;
  const onCrop = Boolean(activeImage.value?.crop);

  dialog.openComponentDialog<FaceReassignProps>(FaceReassignDialog, {
    data: {
      title: t('views.recordings.reassign_face'),
      confirmText: t('components.form.button.save'),
      contentProps: {
        cropUrl: activeImage.value?.url,
        oldName: target.label,
        eventId: props.event.id,
        segIndex: target.seg,
        attrIndex: target.attrIndex,
        confidence: target.attrIndex === undefined ? undefined : props.event.segments?.[target.seg]?.attributes?.[target.attrIndex]?.confidence,
      },
    },
    onConfirm: (newName: string) => reassignFace(target, newName, onCrop),
  });
}

async function reassignFace(target: FaceTarget, newName: string, onCrop: boolean): Promise<void> {
  if (reassignBusy.value) return;
  if (!eventStore.isAvailable.value) return;
  reassignBusy.value = true;
  try {
    const options = target.attrIndex !== undefined ? { attrIndex: target.attrIndex } : undefined;
    const count = await reassignEventFace(props.event.id, target.seg, target.label, newName, options);
    if (count > 0 && onCrop) focusFace.value = { seg: target.seg, label: newName || 'unknown', attrIndex: target.attrIndex };
    toast.add({ severity: 'success', detail: t('views.recordings.reassign_done'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 5000 });
  } finally {
    reassignBusy.value = false;
  }
}

async function toggleFavorite(): Promise<void> {
  const next = !isFavorite.value;
  favoriteOverride.value = next;
  try {
    await eventStore.setEventFavorite(props.event.id, next);
  } catch (error) {
    favoriteOverride.value = null;
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 5000 });
  }
}

async function handleDownload(): Promise<void> {
  if (isDownloading.value) return;
  if (!eventStore.isAvailable.value || !props.event.endTime) return;

  isDownloading.value = true;
  try {
    const result = await exportRange(props.event.cameraId, props.event.startTime, props.event.endTime);
    await download({ url: result.url, filename: result.filename });
  } catch (error) {
    log.error('Download failed:', error);
    toast.add({ severity: 'error', summary: t('views.recordings.download_failed'), detail: extractErrorMessage(error), life: 5000 });
  } finally {
    isDownloading.value = false;
  }
}

function confirmDelete(contentText: string, onConfirm: () => Promise<void>): void {
  dialog.openTextDialog({
    data: {
      title: t('components.dialog.title.confirm'),
      contentText,
      confirmText: t('components.form.button.remove'),
      confirmButtonProps: {
        severity: 'danger',
      },
    },
    onConfirm,
  });
}

async function deleteEvent(): Promise<void> {
  if (deleteBusy.value) return;
  if (!eventStore.isAvailable.value) return;

  deleteBusy.value = true;
  try {
    await eventStore.deleteEvents([props.event.id]);
    toast.add({ severity: 'success', detail: t('views.recordings.delete_event_done'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 5000 });
  } finally {
    deleteBusy.value = false;
  }
}

async function deleteRecording(): Promise<void> {
  if (deleteBusy.value || !props.event.endTime) return;
  if (!eventStore.isAvailable.value) return;

  deleteBusy.value = true;
  try {
    const result = await eventStore.deleteRange(props.event.cameraId, props.event.startTime - EVENT_FOOTAGE_PAD_MS, props.event.endTime + EVENT_FOOTAGE_PAD_MS);
    if (result.endMs > result.startMs) {
      toast.add({ severity: 'success', detail: t('views.recordings.delete_recording_done'), life: 3000 });
    } else {
      toast.add({ severity: 'info', detail: t('views.recordings.delete_recording_too_recent'), life: 5000 });
    }
  } catch (error) {
    log.error('Recording delete failed:', error);
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 5000 });
  } finally {
    deleteBusy.value = false;
  }
}

watch(carouselImages, (images) => {
  const focus = focusFace.value;
  if (!focus) return;
  const index = images.findIndex(
    (img) => img.crop && img.faceSeg === focus.seg && (focus.attrIndex !== undefined ? img.attrIndex === focus.attrIndex : img.label === focus.label),
  );
  if (index < 0) return;
  activeImageIndexRaw.value = index;
  focusFace.value = undefined;
});

useResizeObserver(footerRef, (entries) => {
  const width = entries[0]?.contentRect.width ?? 0;
  const stepped = Math.round(width / FOOTER_STEP_PX) * FOOTER_STEP_PX;
  if (stepped !== footerWidth.value) footerWidth.value = stepped;
});

onUnmounted(() => stopPreview());
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

.carousel-nav {
  background: rgb(0 0 0 / 0.4);
}

.carousel-nav:hover {
  background: rgb(0 0 0 / 0.6);
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
