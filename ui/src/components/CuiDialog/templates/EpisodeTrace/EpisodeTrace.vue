<template>
  <div class="episode-trace flex flex-col h-full min-h-0 overflow-hidden text-wrap">
    <div v-if="status === 'loading'" class="flex items-center justify-center py-12">
      <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
    </div>

    <div v-else-if="status === 'empty'" class="text-sm text-muted text-center py-12">
      {{ $t('views.recordings.episode_trace.empty') }}
    </div>

    <div v-else-if="status === 'unavailable'" class="text-sm text-muted text-center py-12">
      {{ $t('views.recordings.episode_trace.unavailable') }}
    </div>

    <template v-else-if="status === 'ready' && trace">
      <div ref="stageRef" class="stage relative w-full bg-black shrink-0 flex items-center justify-center overflow-hidden">
        <VueZoomable
          v-if="selectedImage"
          v-model:pan="stagePan"
          v-model:zoom="stageZoomLevel"
          :pan-enabled="stageZoomLevel > 1"
          :enable-control-button="false"
          :dbl-click-enabled="false"
          :min-zoom="1"
          :max-zoom="STAGE_MAX_ZOOM"
          :selector="`[data-stage-zoom='${zoomId}']`"
          zoom-origin="pointer"
          class="absolute inset-0 flex items-center justify-center"
          :class="{ 'zoom-constraining': stageConstraining }"
          @panned="onStageZoomPan"
          @zoom="onStageZoomPan"
          @dblclick="onStageDoubleClick"
          @touchstart="onStageTouchStart"
          @touchend="onStageTouchEnd"
        >
          <img ref="imageRef" :data-stage-zoom="zoomId" :src="selectedImage.url" class="max-w-full max-h-full object-contain" alt="" draggable="false" />
        </VueZoomable>
        <span v-else-if="!imagesLoading" class="text-sm text-white/60 px-6 text-center">{{ $t('views.recordings.episode_trace.no_images') }}</span>
        <div v-if="stageMinimapStyle" class="zoom-minimap" :style="stageMinimapBoxStyle ?? undefined">
          <div class="zoom-minimap-viewport" :style="stageMinimapStyle" />
        </div>
        <div v-if="selectedImage" class="absolute bottom-0 inset-x-0 z-[5] px-3 pb-2 pt-6 bg-gradient-to-t from-black/70 to-transparent pointer-events-none">
          <span class="text-xs text-white">{{ selectedIndex + 1 }}. {{ selectedImage.note }}</span>
        </div>
      </div>

      <div class="bg-black shrink-0">
        <div class="flex items-center gap-2 h-7 px-4 pt-2 text-[10px] text-white/50 whitespace-nowrap overflow-hidden">
          <span class="shrink-0">{{ $t('views.recordings.episode_trace.images_summary', { count: images.length }) }}</span>
          <ProgressSpinner v-if="imagesLoading" class="w-[12px] h-[12px] m-0 shrink-0" stroke-width="6" />
        </div>
        <div ref="stripRef" class="strip flex gap-2 px-4 pt-2 pb-3 overflow-x-auto">
          <button
            v-for="(image, index) in images"
            :key="index"
            type="button"
            class="shrink-0 w-[144px] aspect-video rounded-md overflow-hidden bg-black border-2 transition cursor-pointer"
            :class="index === selectedIndex ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100 hover:border-white/40'"
            v-tooltip.top="{ value: image.note }"
            @click="selectedIndex = index"
          >
            <img :src="image.url" class="block w-full h-full object-cover" alt="" />
          </button>
        </div>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto">
        <div class="flex flex-col gap-2 px-4 py-3">
          <div class="tile">
            <div class="tile-head">
              <i-tabler:users class="w-3.5 h-3.5" />
              <span>{{ $t('views.recordings.episode_trace.members') }}</span>
            </div>
            <div class="flex flex-col gap-1.5">
              <div v-for="member in trace.members" :key="member.eventId" class="flex flex-wrap items-center gap-1.5 text-xs" :class="{ 'opacity-60': member.dropped }">
                <span class="chip-dot" :style="{ background: member.dropped ? DROPPED_COLOR : KEPT_COLOR }" />
                <span class="font-semibold text-color">{{ cameraName(member.cameraId) }}</span>
                <span class="font-mono text-muted">{{ formatTime(member.firstSeen) }}–{{ formatTime(member.lastSeen) }}</span>
                <span v-for="label in member.labels" :key="label" class="chip">{{ label }}</span>
                <span v-for="identity in member.identities" :key="identity" class="chip">{{ identity }}</span>
                <span v-if="member.prunedSegments?.length" class="chip text-muted">
                  {{ $t('views.recordings.episode_trace.pruned', { count: member.prunedSegments.length }) }}
                </span>
                <span v-if="member.dropped" class="chip chip-dropped">{{ droppedText(member.dropped) }}</span>
              </div>
            </div>
          </div>

          <div class="tile">
            <div class="tile-head">
              <i-tabler:route class="w-3.5 h-3.5" />
              <span>{{ $t('views.recordings.episode_trace.links') }}</span>
            </div>
            <div v-if="trace.links.length" class="flex flex-col gap-1 text-xs">
              <div v-for="(link, i) in trace.links" :key="i" class="flex flex-wrap items-center gap-1.5">
                <span class="chip-dot" :style="{ background: link.linked ? KEPT_COLOR : DROPPED_COLOR }" />
                <span class="font-semibold text-color">{{ memberName(link.from) }} → {{ memberName(link.to) }}</span>
                <span class="text-muted">{{ link.why }}</span>
              </div>
            </div>
            <span v-else class="tile-empty">–</span>
          </div>

          <div class="tile">
            <div class="tile-head">
              <i-tabler:sparkles class="w-3.5 h-3.5" />
              <span>{{ $t('views.recordings.episode_trace.curation') }}</span>
            </div>
            <template v-if="trace.curation">
              <div class="chips">
                <span class="chip">
                  <span class="chip-dot" :style="{ background: verdictColor }" />
                  {{ verdictText }}
                </span>
                <span v-for="meta in callMeta(trace.curation)" :key="meta" class="chip text-muted">{{ meta }}</span>
              </div>
              <p v-if="trace.curation.kept?.length" class="text-xs text-color">
                <span class="text-muted">{{ $t('views.recordings.episode_trace.kept') }}:</span> {{ trace.curation.kept.map(memberName).join(', ') }}
              </p>
              <p v-if="trace.curation.linkEvidence" class="text-xs text-color">
                <span class="text-muted">{{ $t('views.recordings.episode_trace.evidence') }}:</span> {{ trace.curation.linkEvidence }}
              </p>
              <p v-if="trace.curation.error" class="text-xs text-red-400">{{ trace.curation.error }}</p>
              <details v-if="trace.curation.observations" class="text-xs">
                <summary class="cursor-pointer text-muted">{{ $t('views.recordings.episode_trace.observations') }}</summary>
                <pre class="call-text">{{ trace.curation.observations }}</pre>
              </details>
              <details v-if="trace.curation.raw" class="text-xs">
                <summary class="cursor-pointer text-muted">{{ $t('views.recordings.episode_trace.response') }}</summary>
                <pre class="call-text">{{ trace.curation.raw }}</pre>
              </details>
            </template>
            <span v-else class="tile-empty">–</span>
          </div>

          <div class="tile">
            <div class="tile-head">
              <i-tabler:message-2 class="w-3.5 h-3.5" />
              <span>{{ $t('views.recordings.episode_trace.story') }}</span>
            </div>
            <template v-if="trace.story">
              <div class="chips">
                <span v-if="trace.story.reused" class="chip">{{ $t('views.recordings.episode_trace.reused') }}</span>
                <span v-for="meta in callMeta(trace.story)" :key="meta" class="chip text-muted">{{ meta }}</span>
              </div>
              <p v-if="trace.story.description" class="text-xs text-color">
                <span class="font-semibold">{{ trace.story.description.title }}</span>
                {{ trace.story.description.description }}
              </p>
              <p v-if="trace.story.error" class="text-xs text-red-400">{{ trace.story.error }}</p>
              <p v-if="trace.story.instructions" class="text-xs text-color">
                <span class="text-muted">{{ $t('views.recordings.episode_trace.instructions') }}:</span> {{ trace.story.instructions }}
              </p>
              <details v-if="trace.story.observations" class="text-xs">
                <summary class="cursor-pointer text-muted">{{ $t('views.recordings.episode_trace.observations') }}</summary>
                <pre class="call-text">{{ trace.story.observations }}</pre>
              </details>
              <details v-if="trace.story.raw" class="text-xs">
                <summary class="cursor-pointer text-muted">{{ $t('views.recordings.episode_trace.response') }}</summary>
                <pre class="call-text">{{ trace.story.raw }}</pre>
              </details>
            </template>
            <span v-else class="tile-empty">–</span>
          </div>

          <div class="tile">
            <div class="tile-head">
              <i-tabler:cut class="w-3.5 h-3.5" />
              <span>{{ $t('views.recordings.episode_trace.cut') }}</span>
            </div>
            <div v-if="trace.blocks.length" class="chips">
              <span
                v-for="(block, i) in trace.blocks"
                :key="i"
                class="chip"
                :class="{ 'text-muted': block.secondAngle }"
                v-tooltip.top="block.secondAngle ? { value: $t('views.recordings.episode_trace.second_angle') } : undefined"
              >
                {{ cameraName(block.cameraId) }} {{ clock(block.startMs) }}–{{ clock(block.endMs) }}
              </span>
            </div>
            <span v-else class="tile-empty">–</span>
          </div>

          <div v-if="place" class="tile">
            <div class="tile-head">
              <i-tabler:map-2 class="w-3.5 h-3.5" />
              <span>{{ $t('views.recordings.episode_trace.place') }}</span>
            </div>
            <p class="text-xs text-color whitespace-pre-line">{{ place }}</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { thumbnailToUrl, useEventStore } from '@camera.ui/nvr';
import VueZoomable from 'vue-zoomable';
import DownloadIcon from '~icons/tabler/download';

import { extractErrorMessage, randomLetter } from '@/common/utils.js';
import { buildStoredZip } from '@/utils/zipStore.js';

import type { DialogRefProps } from '@/composables/useCuiDialog.js';
import type { ZipEntry } from '@/utils/zipStore.js';
import type { EpisodeTrace, EpisodeTraceCall } from '@camera.ui/nvr';
import type { EpisodeTracePlugin, EpisodeTraceProps } from './types.js';

interface TraceImage {
  note: string;
  data: Uint8Array<ArrayBuffer>;
  url: string;
}

const props = defineProps<EpisodeTraceProps>();

const log = useLogger();
const toast = useCuiToast();
const { t } = useI18n();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;
const { plugin: nvrPluginRef } = usePlugin('@camera.ui/camera-ui-nvr');
const eventStore = useEventStore('@camera.ui/camera-ui-nvr');

const KEPT_COLOR = '#22c55e';
const DROPPED_COLOR = '#ef4444';
const FALLBACK_COLOR = '#eab308';

const stripRef = useTemplateRef<HTMLElement>('stripRef');
const stageRef = useTemplateRef<HTMLElement>('stageRef');
const imageRef = useTemplateRef<HTMLImageElement>('imageRef');
const trace = shallowRef<EpisodeTrace>();
const images = shallowRef<TraceImage[]>([]);
const status = ref<'loading' | 'ready' | 'empty' | 'unavailable'>('loading');
const imagesLoading = ref(false);
const selectedIndex = ref(0);
const bundleBusy = ref(false);

const zoomId = randomLetter();
const {
  zoom: stageZoomLevel,
  pan: stagePan,
  constraining: stageConstraining,
  minimapStyle: stageMinimapStyle,
  minimapBoxStyle: stageMinimapBoxStyle,
  onZoomPan: onStageZoomPan,
  onDoubleClick: onStageDoubleClick,
  onTouchStart: onStageTouchStart,
  onTouchEnd: onStageTouchEnd,
  reset: resetStageZoom,
} = useStageZoom(stageRef, imageRef);

let loadStarted = false;

const selectedImage = computed(() => images.value[selectedIndex.value]);

const place = computed(() => {
  const spatial = trace.value?.spatial;
  if (!spatial) return '';
  try {
    const parsed = JSON.parse(spatial) as { place?: string };
    return parsed.place ?? '';
  } catch {
    return '';
  }
});

const verdictText = computed(() => {
  const call = trace.value?.curation;
  if (!call) return '';
  if (call.error) return t('views.recordings.episode_trace.call_failed');
  return call.coherent ? t('views.recordings.episode_trace.coherent') : t('views.recordings.episode_trace.not_coherent');
});

const verdictColor = computed(() => {
  const call = trace.value?.curation;
  if (!call || call.error) return FALLBACK_COLOR;
  return call.coherent ? KEPT_COLOR : DROPPED_COLOR;
});

function cameraName(cameraId: string): string {
  return props.cameraById.get(cameraId)?.name ?? trace.value?.cameras[cameraId] ?? cameraId;
}

function memberName(eventId: string): string {
  const member = trace.value?.members.find((m) => m.eventId === eventId);
  return member ? cameraName(member.cameraId) : eventId;
}

function droppedText(reason: string): string {
  return t(`views.recordings.episode_trace.dropped_${reason.replace('-', '_')}`, reason);
}

function callMeta(call: EpisodeTraceCall): string[] {
  const out: string[] = [];
  if (call.model) out.push(call.model);
  if (call.attempts) out.push(t('views.recordings.episode_trace.attempts', { count: call.attempts }));
  if (call.durationMs) out.push(`${(call.durationMs / 1000).toFixed(1)}s`);
  return out;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function clock(ms: number): string {
  const total = Math.max(ms - props.episode.startTime, 0) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total - minutes * 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

async function load(plugin: EpisodeTracePlugin): Promise<void> {
  try {
    const result = await plugin.getEpisodeTrace(props.episode.id);
    if (!result) {
      status.value = 'empty';
      return;
    }
    trace.value = result;
    status.value = 'ready';
    imagesLoading.value = true;
    const list = await plugin.getEpisodeTraceImages(props.episode.id);
    images.value = list
      .filter((image) => image.data && image.data.length > 0)
      .map((image) => {
        const data = new Uint8Array(image.data!);
        return { note: image.note, data, url: thumbnailToUrl(data) ?? '' };
      });
  } catch (error) {
    log.error('Episode trace failed:', error);
    if (status.value === 'loading') status.value = 'unavailable';
  } finally {
    imagesLoading.value = false;
  }
}

async function exportBundle(): Promise<void> {
  const current = trace.value;
  const plugin = nvrPluginRef.value as unknown as EpisodeTracePlugin | undefined;
  if (bundleBusy.value || !current || !plugin) return;
  bundleBusy.value = true;
  try {
    const encoder = new TextEncoder();
    const entries: ZipEntry[] = [];
    const cameras = Object.fromEntries([...props.cameraById.values()].map((camera) => [camera._id, camera.name]));

    entries.push({ name: 'episode.json', data: encoder.encode(JSON.stringify({ episode: props.episode, cameras }, null, 2)) });
    const { fixture, spatial, images: imageNotes, ...rest } = current;
    entries.push({ name: 'trace.json', data: encoder.encode(JSON.stringify({ ...rest, images: imageNotes.map((image) => image.note) }, null, 2)) });
    entries.push({ name: 'input.json', data: encoder.encode(fixture) });
    if (spatial) entries.push({ name: 'spatial.json', data: encoder.encode(spatial) });

    for (const [index, image] of images.value.entries()) {
      entries.push({ name: `images/${String(index + 1).padStart(2, '0')}.jpg`, data: image.data });
    }
    if (images.value.length > 0) {
      entries.push({ name: 'images/notes.txt', data: encoder.encode(`${images.value.map((image, index) => `${index + 1}. ${image.note}`).join('\n')}\n`) });
    }

    const mosaic = await eventStore.loadEpisodeMosaic(props.episode.id);
    if (mosaic) entries.push({ name: 'mosaic.jpg', data: new Uint8Array(mosaic) });

    const clip = await exportClip(plugin);
    if (clip) entries.push({ name: 'clip.mp4', data: clip });

    const blob = buildStoredZip(entries);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `episode-trace-${props.episode.id.slice(0, 8)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    log.error('Episode trace bundle failed:', error);
    toast.add({ severity: 'error', summary: t('views.recordings.episode_trace.bundle_failed'), detail: extractErrorMessage(error), life: 5000 });
  } finally {
    bundleBusy.value = false;
  }
}

async function exportClip(plugin: EpisodeTracePlugin): Promise<Uint8Array<ArrayBuffer> | undefined> {
  try {
    const result = await plugin.nvrExportEpisode(props.episode.id);
    const response = await fetch(result.url, { credentials: 'include' });
    if (!response.ok) return undefined;
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    log.warn('Clip export for the episode bundle failed:', error);
    return undefined;
  }
}

function updateHeaderActions(): void {
  if (!dialogRefProps.headerActions) return;
  dialogRefProps.headerActions.value =
    status.value === 'ready'
      ? [{ icon: DownloadIcon, tooltip: t('views.recordings.episode_trace.bundle_hint'), onClick: () => void exportBundle(), loading: bundleBusy.value }]
      : [];
}

useEventListener(
  stripRef,
  'wheel',
  (e: WheelEvent) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      stripRef.value?.scrollBy({ left: e.deltaY });
    }
  },
  { passive: false },
);

watch(selectedIndex, resetStageZoom);

watch(
  nvrPluginRef,
  (proxy) => {
    if (!proxy || loadStarted) return;
    loadStarted = true;
    load(proxy as unknown as EpisodeTracePlugin);
  },
  { immediate: true },
);

watch([status, bundleBusy], updateHeaderActions, { immediate: true });
</script>

<style scoped>
.stage {
  height: clamp(180px, 34vh, 400px);
}

.zoom-constraining :deep(> *) {
  transition: transform 0.15s ease-out !important;
}

.zoom-minimap {
  position: absolute;
  right: 10px;
  bottom: 44px;
  width: 80px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.5);
  z-index: 5;
  pointer-events: none;
  overflow: hidden;
}

.zoom-minimap-viewport {
  position: absolute;
  border: 1.5px solid rgba(255, 255, 255, 0.7);
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.12);
}

.tile {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 0.75rem;
  background: var(--card-background);
}

.tile-head {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-secondary-color);
}

.tile-empty {
  font-size: 0.75rem;
  color: var(--text-secondary-color);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  max-width: 100%;
  padding: 0.125rem 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  font-size: 0.75rem;
  color: var(--text-color);
}

.chip-dropped {
  border-color: rgba(239, 68, 68, 0.5);
}

.chip-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  flex-shrink: 0;
}

.call-text {
  margin-top: 0.25rem;
  padding: 0.5rem 0.75rem;
  max-height: 320px;
  overflow: auto;
  border-radius: 0.5rem;
  background: var(--ground-background);
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-word;
}

.strip {
  scrollbar-width: none;
}

.strip::-webkit-scrollbar {
  display: none;
}
</style>
