<template>
  <div class="event-trace flex flex-col h-full min-h-0 overflow-hidden text-wrap">
    <div v-if="status === 'loading'" class="flex items-center justify-center py-12">
      <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
    </div>

    <div v-else-if="status === 'empty'" class="text-sm text-muted text-center py-12">
      {{ $t('views.recordings.trace.empty') }}
    </div>

    <div v-else-if="status === 'unavailable'" class="text-sm text-muted text-center py-12">
      {{ $t('views.recordings.trace.unavailable') }}
    </div>

    <template v-else-if="status === 'ready'">
      <div class="stage relative w-full bg-black shrink-0 flex items-center justify-center overflow-hidden">
        <div class="frame relative" :style="{ '--ar-w': stageAspect.w, '--ar-h': stageAspect.h }">
          <div ref="playerRef" class="absolute inset-0" />

          <div class="absolute inset-0 z-[3] transition-opacity duration-500" :class="playerLive ? 'opacity-0' : 'opacity-100'">
            <Transition
              enter-active-class="transition-opacity duration-300 ease-out"
              enter-from-class="opacity-0"
              enter-to-class="opacity-100"
              leave-active-class="transition-opacity duration-200 ease-in"
              leave-from-class="opacity-100"
              leave-to-class="opacity-0"
              mode="out-in"
            >
              <canvas v-if="stagePicture" :key="stageVersion" ref="stageCanvasRef" class="absolute inset-0 w-full h-full object-contain" />
              <div v-else :key="`empty-${stageVersion}`" class="absolute inset-0 flex items-center justify-center text-sm text-white/60 px-6 text-center">
                <span v-if="stageLoading || selected?.status === 'pending' || framesStatus === 'loading'">{{ $t('views.recordings.trace.loading_frames') }}</span>
                <span v-else-if="framesStatus === 'nodata'">{{ $t('views.recordings.trace.no_recording') }}</span>
                <span v-else-if="framesStatus === 'unsupported'">{{ $t('views.recordings.trace.unsupported') }}</span>
                <span v-else>{{ $t('views.recordings.trace.missing') }}</span>
              </div>
            </Transition>
          </div>

          <CuiPolygon
            v-if="showPlayback"
            class="absolute inset-0 z-[4] pointer-events-none"
            :camera-zones="showZones ? objectZones : []"
            :motion-zones="showZones ? motionZones : []"
            :alert-zones="showZones ? alertZones : []"
            :privacy-zones="privacyZones"
            :show-labels="showZones"
          />

          <div v-if="playbackNotice" class="absolute inset-0 z-[4] flex items-center justify-center text-sm text-white/70 px-6 text-center bg-black/60">
            {{ playbackNotice }}
          </div>
        </div>

        <div class="absolute top-2 right-2 z-[5] dark-mode">
          <Button
            v-tooltip.bottom="{ value: $t('views.recordings.trace.zones') }"
            rounded
            text
            severity="contrast"
            :class="showZones ? 'bg-white/25 hover:bg-white/35' : 'bg-black/30 hover:bg-black/50'"
            @click="showZones = !showZones"
          >
            <template #icon>
              <i-tabler:polygon class="w-5 h-5" />
            </template>
          </Button>
        </div>

        <div v-if="stageLoading" class="absolute top-4 left-4 z-[5]">
          <ProgressSpinner class="w-[18px] h-[18px] m-0" stroke-width="6" />
        </div>

        <div class="absolute bottom-0 inset-x-0 z-[5] dark-mode">
          <div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
          <div class="relative flex items-center gap-2 px-3 pb-2 pt-6">
            <Button v-tooltip.top="{ value: playButtonHint }" text severity="contrast" class="control-bar-btn" @click="showPlayback ? togglePlay() : togglePlayback()">
              <template #icon>
                <i-tabler:player-pause v-if="isPlaying" class="w-[18px] h-[18px]" />
                <i-tabler:player-play v-else class="w-[18px] h-[18px]" />
              </template>
            </Button>
            <template v-if="showPlayback">
              <Button v-tooltip.top="{ value: $t('views.recordings.trace.show_frame') }" text severity="contrast" class="control-bar-btn" @click="togglePlayback">
                <template #icon>
                  <i-tabler:photo class="w-[18px] h-[18px]" />
                </template>
              </Button>
              <span class="text-xs font-mono text-white tabular-nums shrink-0 ml-1">{{ clock(playheadMs - event.startTime) }}</span>
              <div
                ref="scrubRef"
                class="flex-1 h-6 flex items-center cursor-pointer touch-none select-none"
                @pointerdown="onScrubDown"
                @pointermove="onScrubMove"
                @pointerup="onScrubUp"
                @pointercancel="onScrubUp"
              >
                <div class="relative w-full h-1.5 rounded-full bg-white/25">
                  <div v-for="mark in scrubMarks" :key="mark" class="absolute top-0 bottom-0 w-px bg-white/60" :style="{ left: `${mark}%` }" />
                  <div class="absolute inset-y-0 left-0 rounded-full bg-primary-500" :style="{ width: `${playedPct}%` }" />
                  <div class="scrub-knob" :style="{ left: `${playedPct}%` }" />
                </div>
              </div>
              <span class="text-xs font-mono text-white/70 tabular-nums shrink-0">{{ clock(windowEndMs - event.startTime) }}</span>
            </template>
            <template v-else-if="selected">
              <span class="font-mono text-sm text-white ml-1">+{{ relativeSeconds(selected.tick.tMs) }}s</span>
              <span class="text-xs text-white/70">{{ formatTime(selected.tick.tMs) }}</span>
              <span :class="['text-[10px] px-1.5 py-0.5 rounded-md font-semibold', statusClass(selected.status)]">
                {{ $t(`views.recordings.trace.status_${selected.status}`) }}
              </span>
              <span class="ml-auto text-[10px] font-mono text-white/50">{{ frameSource(selected.tick) }}</span>
            </template>
          </div>
        </div>
      </div>

      <div class="bg-black shrink-0">
        <div class="flex items-center gap-2 h-7 px-4 pt-2 text-[10px] text-white/50 whitespace-nowrap overflow-hidden">
          <span class="shrink-0">{{ $t('views.recordings.trace.summary', { loaded: frames.length, total }) }}</span>
          <ProgressSpinner
            v-if="framesStatus === 'loading'"
            v-tooltip.top="{ value: $t('views.recordings.trace.loading_frames') }"
            class="w-[12px] h-[12px] m-0 shrink-0"
            stroke-width="6"
          />
          <span
            v-if="codecFallback"
            v-tooltip.top="{ value: $t('views.recordings.trace.codec_fallback') }"
            class="ml-auto min-w-0 flex items-center gap-1 text-amber-400"
          >
            <i-mdi:alert-outline class="w-3.5 h-3.5 shrink-0" />
            <span class="truncate">{{ $t('views.recordings.trace.codec_fallback_short') }}</span>
          </span>
        </div>
        <div ref="stripRef" class="strip flex gap-2 px-4 pt-2 pb-3 overflow-x-auto" @scroll.passive="onStripScroll">
          <button
            v-for="(frame, index) in frames"
            :key="frame.tick.tMs"
            type="button"
            class="thumb shrink-0 rounded-md overflow-hidden bg-black border-2 transition cursor-pointer"
            :class="index === selectedIndex ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100 hover:border-white/40'"
            :style="{ width: `${THUMB_WIDTH}px`, aspectRatio: frameAspect(frame) }"
            v-tooltip.top="{ value: `+${relativeSeconds(frame.tick.tMs)}s · ${formatTime(frame.tick.tMs)}` }"
            @click="select(index)"
          >
            <canvas v-if="frame.thumb" :ref="(el) => setThumbCanvas(index, el)" class="block w-full h-full" />
            <div v-else class="w-full h-full flex items-center justify-center text-[10px] text-white/50 px-1 text-center">+{{ relativeSeconds(frame.tick.tMs) }}s</div>
          </button>
        </div>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto">
        <div v-if="selected" class="flex flex-col gap-2 px-4 py-3">
          <div class="tile">
            <div class="tile-head">
              <i-tabler:activity class="w-3.5 h-3.5" />
              <span>{{ $t('views.recordings.trace.motion_boxes') }}</span>
            </div>
            <span class="tile-value text-color">{{ selected.tick.motion?.length ?? 0 }}</span>
          </div>

          <div class="tile">
            <div class="tile-head">
              <i-tabler:focus-centered class="w-3.5 h-3.5" />
              <span>{{ $t('views.recordings.trace.objects') }}</span>
            </div>
            <div v-if="selected.tick.world.length" class="chips">
              <span v-for="(obj, i) in selected.tick.world" :key="i" class="chip">
                <span class="chip-dot" :style="{ background: STATE_COLORS[obj.state] ?? '#fff' }" />
                {{ objectText(obj) }}
              </span>
            </div>
            <span v-else class="tile-empty">–</span>
          </div>

          <div class="tile">
            <div class="tile-head">
              <i-tabler:id class="w-3.5 h-3.5" />
              <span>{{ $t('views.recordings.trace.attributes') }}</span>
            </div>
            <div v-if="selected.tick.attrs?.length" class="chips">
              <span v-for="(attr, i) in selected.tick.attrs" :key="i" class="chip">
                <span class="chip-dot" :style="{ background: ATTRIBUTE_COLORS[attr.type] ?? '#fff' }" />
                {{ attributeText(attr) }}
              </span>
            </div>
            <span v-else class="tile-empty">–</span>
          </div>

          <div class="tile">
            <div class="tile-head">
              <i-tabler:eye class="w-3.5 h-3.5" />
              <span>{{ $t('views.recordings.trace.raw_detections') }}</span>
            </div>
            <div v-if="selected.tick.detections.length" class="chips">
              <span v-for="(det, i) in selected.tick.detections" :key="i" class="chip">{{ det.label }} {{ pct(det.confidence) }}</span>
            </div>
            <span v-else class="tile-empty">{{ selected.tick.objectRan === false ? $t('views.recordings.trace.detector_idle') : '–' }}</span>
          </div>

          <div class="tile">
            <div class="tile-head">
              <i-tabler:route class="w-3.5 h-3.5" />
              <span>{{ $t('views.recordings.trace.world_events') }}</span>
            </div>
            <div v-if="selected.tick.events.length" class="chips">
              <span v-for="(e, i) in selected.tick.events" :key="i" class="chip">{{ eventText(e) }}</span>
            </div>
            <span v-else class="tile-empty">–</span>
          </div>

          <div class="tile">
            <div class="tile-head">
              <i-tabler:info-circle class="w-3.5 h-3.5" />
              <span>{{ $t('views.recordings.trace.info') }}</span>
            </div>
            <div v-if="findings.length" class="chips">
              <span v-for="(finding, i) in findings" :key="i" class="chip">
                <span class="text-muted">{{ $t(`views.recordings.trace.scope_${finding.scope}`) }}</span>
                {{ finding.text }}
              </span>
            </div>
            <span v-else class="tile-empty">–</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { playheadUs, useEventTrace, useNvrPlayback } from '@camera.ui/nvr';
import DownloadIcon from '~icons/tabler/download';

import { detectionStyle } from '@/common/detectionLabels.js';
import { extractErrorMessage } from '@/common/utils.js';
import { buildStoredZip } from '@/utils/zipStore.js';
import { boxIntersectsPolygon, boxMatchesZone } from '@/utils/zoneGeometry.js';

import type { DialogRefProps } from '@/composables/useCuiDialog.js';
import type { ZipEntry } from '@/utils/zipStore.js';
import type { TraceFrame, TraceFrameStatus, TraceTick } from '@camera.ui/nvr';
import type { AlertZone, BoundingBox, MotionZone, ObjectZone, PrivacyZone } from '@camera.ui/sdk';
import type { EventTraceProps } from './types.js';

interface TraceFinding {
  scope: 'frame' | 'event';
  text: string;
}

const props = defineProps<EventTraceProps>();

const log = useLogger();
const toast = useCuiToast();
const { t } = useI18n();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;
const { plugin: nvrPluginRef } = usePlugin('@camera.ui/camera-ui-nvr');
const nvrController = useNvrPlayback(
  computed(() => props.camera._id),
  { sourceRole: computed(() => props.camera.interfaceSettings?.playbackSource ?? 'auto') },
);
const { trace, frames, total, hasMore, status, framesStatus, codecFallback, load, loadMore, allTicks, ensureFrames, fullFrame } = useEventTrace();

const THUMB_WIDTH = 144;
const STRIP_GAP = 8;
const BUNDLE_MAX_FRAMES = 60;
const PREFETCH_AHEAD = 12;
const PREFETCH_BEHIND = 4;
const OPEN_EVENT_TAIL_MS = 2000;
const SCRUB_INTERVAL_MS = 120;
const STATE_COLORS: Record<string, string> = {
  active: '#22c55e',
  tentative: '#eab308',
  stationary: '#9ca3af',
  lost: '#ef4444',
  departed: '#ef4444',
  external: '#60a5fa',
};
const MOTION_COLOR = detectionStyle('motion').color;
const MOTION_FILL = 'rgba(168, 85, 247, 0.22)';
const RAW_COLOR = '#e5e7eb';
const ATTRIBUTE_COLORS: Record<string, string> = {
  face: detectionStyle('face').color,
  plate: detectionStyle('license_plate').color,
  class: detectionStyle('classifier').color,
};

const stageCanvasRef = useTemplateRef<HTMLCanvasElement>('stageCanvasRef');
const playerRef = useTemplateRef<HTMLElement>('playerRef');
const scrubRef = useTemplateRef<HTMLElement>('scrubRef');
const stripRef = useTemplateRef<HTMLElement>('stripRef');
const thumbCanvases = new Map<number, HTMLCanvasElement>();
const selectedIndex = ref(-1);
const stagePicture = shallowRef<ImageBitmap>();
const stageIsOwnFrame = ref(false);
const stageVersion = ref(0);
const stageLoading = ref(false);
const showZones = ref(false);
const showPlayback = ref(false);
const playheadMs = ref(props.event.startTime);
const scrubbing = ref(false);
const ended = ref(false);
const bundleBusy = ref(false);

let stageRequest = 0;
let wasPlayingBeforeScrub = false;
let lastScrubSent = 0;

const selected = computed<TraceFrame | undefined>(() => frames.value[selectedIndex.value]);

const stageAspect = computed(() => {
  const picture = stagePicture.value ?? selected.value?.thumb ?? frames.value.find((f) => f.thumb)?.thumb;
  return picture ? { w: picture.width, h: picture.height } : { w: 16, h: 9 };
});

const zones = computed(() => trace.value?.config?.zones ?? props.camera.zones);
const privacyZones = computed<PrivacyZone[]>(() => zones.value?.privacy ?? []);
const objectZones = computed<ObjectZone[]>(() => zones.value?.object ?? []);
const motionZones = computed<MotionZone[]>(() => zones.value?.motion ?? []);
const alertZones = computed<AlertZone[]>(() => zones.value?.alert ?? []);
const droppingPrivacyZones = computed(() => privacyZones.value.filter((zone) => zone.dropDetections !== false));
const thresholds = computed<Record<string, number>>(() => trace.value?.config?.objectConfidences ?? props.camera.detectionSettings?.object?.confidences ?? {});

const findings = computed<TraceFinding[]>(() => {
  const tick = selected.value?.tick;
  if (!tick) return [];
  const out: TraceFinding[] = [];
  const frame = (text: string) => out.push({ scope: 'frame', text });
  const event = (text: string) => out.push({ scope: 'event', text });

  if (tick.objectRan !== false) {
    for (const det of tick.detections) {
      const box: [number, number, number, number] = [det.x, det.y, det.width, det.height];
      if (tick.world.some((obj) => covers(obj.box, box))) continue;
      frame(rawFinding(det.label, det.confidence, { x: det.x, y: det.y, width: det.width, height: det.height }));
    }
  }
  for (const obj of tick.world) {
    if (obj.state === 'tentative') frame(t('views.recordings.trace.hint_tentative', { label: obj.label, id: obj.id }));
  }

  if (props.camera.notificationSettings?.enabled === false) event(t('views.recordings.trace.hint_notifications_off'));
  const segments = props.event.segments ?? [];
  if (segments.length === 0) {
    event(t('views.recordings.trace.hint_motion_only'));
    return out;
  }
  const detections = segments.flatMap((segment) => segment.detections);
  const blocked = detections.filter((d) => d.alert === false).map((d) => d.label);
  if (blocked.length > 0 && !detections.some((d) => d.alert !== false)) {
    event(t('views.recordings.trace.hint_outside_alert_zones', { labels: [...new Set(blocked)].join(', ') }));
  }
  return out;
});

const isPlaying = computed(() => nvrController.mode.value === 'play');
const playButtonHint = computed(() => {
  if (!showPlayback.value) return t('views.recordings.trace.playback');
  return isPlaying.value ? t('views.recordings.trace.pause') : t('views.recordings.trace.play');
});
const playbackNotice = computed(() => {
  if (!showPlayback.value) return '';
  if (nvrController.noData.value) return t('views.recordings.trace.no_recording');
  if (nvrController.unsupported.value) return t('views.recordings.trace.unsupported');
  if (nvrController.playbackError.value) return t('views.recordings.trace.playback_failed');
  return '';
});

const playerLive = computed(() => showPlayback.value && nvrController.mode.value !== 'idle' && !nvrController.loading.value && !playbackNotice.value);

const windowEndMs = computed(() => {
  if (props.event.endTime) return props.event.endTime;
  const last = frames.value[frames.value.length - 1]?.tick.tMs ?? props.event.startTime;
  return last + OPEN_EVENT_TAIL_MS;
});
const playedPct = computed(() => scrubFraction(playheadMs.value) * 100);
const scrubMarks = computed(() => {
  const marks = new Set<number>();
  for (const frame of frames.value) {
    if (frame.tick.world.length > 0) marks.add(Math.round(scrubFraction(frame.tick.tMs) * 1000) / 10);
  }
  return [...marks];
});

const onStripScroll = useThrottleFn(loadVisible, 150, true);

function select(index: number): void {
  selectedIndex.value = index;
  ensureFrames(index - PREFETCH_BEHIND, index + PREFETCH_AHEAD);
}

function loadVisible(): void {
  const strip = stripRef.value;
  if (!strip) return;
  const step = THUMB_WIDTH + STRIP_GAP;
  const first = Math.floor(strip.scrollLeft / step);
  const count = Math.ceil(strip.clientWidth / step) + 1;
  ensureFrames(first - PREFETCH_BEHIND, first + count + PREFETCH_AHEAD);
  if (hasMore.value && first + count + PREFETCH_AHEAD >= frames.value.length) {
    loadMore().then(() => nextTick(loadVisible));
  }
}

function setThumbCanvas(index: number, el: unknown): void {
  if (el instanceof HTMLCanvasElement) {
    thumbCanvases.set(index, el);
    const frame = frames.value[index];
    if (frame?.thumb) drawThumb(el, frame.thumb);
  } else {
    thumbCanvases.delete(index);
  }
}

function drawThumb(canvas: HTMLCanvasElement, picture: ImageBitmap): void {
  canvas.width = picture.width;
  canvas.height = picture.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(picture, 0, 0);
  coverPrivacy(ctx, picture.width, picture.height);
}

async function showStage(index: number): Promise<void> {
  const frame = frames.value[index];
  if (!frame) {
    setStagePicture(undefined, false);
    return;
  }
  const request = ++stageRequest;
  stageLoading.value = true;
  const full = await fullFrame(index);
  if (request !== stageRequest) return;
  stageLoading.value = false;
  if (full) setStagePicture(full, true);
  else setStagePicture(frame.thumb, false);
}

function setStagePicture(picture: ImageBitmap | undefined, own: boolean): void {
  stageIsOwnFrame.value = own;
  stagePicture.value = picture;
  stageVersion.value++;
}

function drawStage(): void {
  const canvas = stageCanvasRef.value;
  const frame = selected.value;
  const picture = stagePicture.value;
  if (!canvas || !frame || !picture) return;
  if (stageIsOwnFrame.value) drawPicture(canvas, picture, frame.tick);
  else drawThumb(canvas, picture);
}

function drawPicture(canvas: HTMLCanvasElement, picture: ImageBitmap, tick: TraceTick): void {
  const w = picture.width;
  const h = picture.height;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.drawImage(picture, 0, 0);
  coverPrivacy(ctx, w, h);

  const scale = Math.max(0.6, w / 640);
  ctx.lineWidth = 2 * scale;
  ctx.font = `${Math.round(12 * scale)}px sans-serif`;
  ctx.textBaseline = 'top';

  if (showZones.value) drawZones(ctx, w, h, scale);

  for (const box of tick.motion ?? []) {
    fillBox(ctx, box, w, h, MOTION_FILL);
    strokeBox(ctx, box, w, h, MOTION_COLOR);
    labelBox(ctx, box, w, h, MOTION_COLOR, t('views.recordings.trace.motion_label'), scale);
  }

  ctx.setLineDash([5 * scale, 3 * scale]);
  for (const det of tick.detections) {
    const box: [number, number, number, number] = [det.x, det.y, det.width, det.height];
    if (tick.world.some((obj) => covers(obj.box, box))) continue;
    strokeBox(ctx, box, w, h, RAW_COLOR);
    labelBox(ctx, box, w, h, RAW_COLOR, `${det.label} ${pct(det.confidence)} ${t('views.recordings.trace.raw_label')}`, scale, true);
  }
  ctx.setLineDash([]);

  for (const obj of tick.world) {
    const color = STATE_COLORS[obj.state] ?? '#ffffff';
    strokeBox(ctx, obj.box, w, h, color);
    labelBox(ctx, obj.box, w, h, color, objectLabel(obj), scale);
  }

  for (const attr of tick.attrs ?? []) {
    const color = ATTRIBUTE_COLORS[attr.type] ?? '#ffffff';
    strokeBox(ctx, attr.box, w, h, color);
    labelBox(ctx, attr.box, w, h, color, `${attr.type}:${attr.label} ${pct(attr.conf)}`, scale, true);
  }
}

function strokeBox(ctx: CanvasRenderingContext2D, box: [number, number, number, number], w: number, h: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.strokeRect(box[0] * w, box[1] * h, box[2] * w, box[3] * h);
}

function fillBox(ctx: CanvasRenderingContext2D, box: [number, number, number, number], w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(box[0] * w, box[1] * h, box[2] * w, box[3] * h);
}

function drawZones(ctx: CanvasRenderingContext2D, w: number, h: number, scale: number): void {
  const draw = (kind: 'motion' | 'object' | 'alert', zone: MotionZone | ObjectZone | AlertZone, dash: number[], alpha: string) => {
    if (zone.points.length < 3) return;
    ctx.beginPath();
    for (const [index, [x, y]] of zone.points.entries()) {
      const px = (x / 100) * w;
      const py = (y / 100) * h;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = `${zone.color}${alpha}`;
    ctx.fill();
    ctx.setLineDash(dash.map((d) => d * scale));
    ctx.strokeStyle = zone.color;
    ctx.stroke();
    ctx.setLineDash([]);
    const top = zone.points.reduce((best, point) => (point[1] < best[1] ? point : best), zone.points[0]);
    const box: [number, number, number, number] = [top[0] / 100, top[1] / 100, 0, 0];
    labelBox(ctx, box, w, h, zone.color, `${t(`components.polygon.kind_${kind}`)} · ${zone.name}`, scale);
  };
  for (const zone of motionZones.value) draw('motion', zone, [], '26');
  for (const zone of objectZones.value) draw('object', zone, zone.type === 'intersect' ? [5, 5] : [], '33');
  for (const zone of alertZones.value) draw('alert', zone, [2, 4], '1f');
}

function labelBox(
  ctx: CanvasRenderingContext2D,
  box: [number, number, number, number],
  w: number,
  h: number,
  color: string,
  text: string,
  scale: number,
  below = false,
): void {
  const pad = 3 * scale;
  const lineHeight = 14 * scale;
  const width = ctx.measureText(text).width + pad * 2;
  const x = Math.min(Math.max(box[0] * w, 0), Math.max(w - width, 0));
  const top = box[1] * h;
  let y = below ? top + box[3] * h : top - lineHeight;
  if (y < 0) y = top;
  if (y + lineHeight > h) y = h - lineHeight;

  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, lineHeight);
  ctx.fillStyle = '#000';
  ctx.fillText(text, x + pad, y + pad * 0.5);
}

function coverPrivacy(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#000';
  for (const zone of privacyZones.value) {
    if (zone.points.length < 3) continue;
    ctx.beginPath();
    for (const [index, [x, y]] of zone.points.entries()) {
      const px = (x / 100) * w;
      const py = (y / 100) * h;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
}

function redrawThumbs(): void {
  for (const [index, canvas] of thumbCanvases) {
    const frame = frames.value[index];
    if (frame?.thumb) drawThumb(canvas, frame.thumb);
  }
}

function scrollThumbIntoView(): void {
  const strip = stripRef.value;
  const thumb = strip?.children[selectedIndex.value];
  if (thumb instanceof HTMLElement) thumb.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
}

function frameAspect(frame: TraceFrame): string {
  if (frame.thumb) return `${frame.thumb.width} / ${frame.thumb.height}`;
  return `${stageAspect.value.w} / ${stageAspect.value.h}`;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function covers(tracked: [number, number, number, number], box: [number, number, number, number]): boolean {
  const cx = box[0] + box[2] / 2;
  const cy = box[1] + box[3] / 2;
  return cx >= tracked[0] && cx <= tracked[0] + tracked[2] && cy >= tracked[1] && cy <= tracked[1] + tracked[3];
}

function relativeSeconds(tMs: number): string {
  return ((tMs - props.event.startTime) / 1000).toFixed(1);
}

function formatTime(tMs: number): string {
  return new Date(tMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function clock(ms: number): string {
  const total = Math.max(ms, 0) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}

function frameSource(tick: TraceTick): string {
  const parts: string[] = [];
  if (tick.src) parts.push(tick.src);
  if (tick.rtp !== undefined) parts.push(`rtp ${tick.rtp}`);
  return parts.join(' · ');
}

function statusClass(frameStatus: TraceFrameStatus): string {
  switch (frameStatus) {
    case 'exact':
      return 'bg-green-600/80 text-white';
    case 'approx':
      return 'bg-amber-500/80 text-black';
    default:
      return 'bg-white/20 text-white';
  }
}

function objectId(obj: TraceTick['world'][number]): string {
  return obj.state === 'external' ? '' : ` #${obj.id}`;
}

function objectLabel(obj: TraceTick['world'][number]): string {
  return `${obj.label} ${pct(obj.conf)}${objectId(obj)} ${t(`views.recordings.trace.state_${obj.state}`, obj.state)}`;
}

function objectText(obj: TraceTick['world'][number]): string {
  return `${obj.label}${objectId(obj)} · ${t(`views.recordings.trace.state_${obj.state}`, obj.state)} · ${pct(obj.conf)}`;
}

function eventText(e: TraceTick['events'][number]): string {
  const id = e.state === 'external' || e.state === 'crossed' ? '' : ` #${e.id}`;
  return `${e.kind} ${e.label}${id}`;
}

function attributeText(attr: NonNullable<TraceTick['attrs']>[number]): string {
  return `${attr.type}:${attr.label} ${pct(attr.conf)}${attr.parent !== undefined ? ` (#${attr.parent})` : ''}`;
}

function rawFinding(label: string, confidence: number, box: BoundingBox): string {
  const min = thresholds.value[label];
  if (min !== undefined && confidence < min) return t('views.recordings.trace.hint_below_threshold', { label, min: pct(min) });
  if (droppingPrivacyZones.value.some((zone) => boxIntersectsPolygon(box, zone.points))) return t('views.recordings.trace.hint_in_privacy', { label });
  if (objectZones.value.length > 0) {
    const inside = objectZones.value.filter((zone) => boxMatchesZone(box, zone.points, zone.type));
    if (inside.length === 0) return t('views.recordings.trace.hint_outside_zones', { label });
    const allowed = inside.some((zone) => zone.labels.length === 0 || zone.labels.some((l) => l.toLowerCase() === label.toLowerCase()));
    if (!allowed) return t('views.recordings.trace.hint_label_not_in_zone', { label, zones: inside.map((zone) => zone.name).join(', ') });
  }
  return t('views.recordings.trace.hint_not_confirmed', { label });
}

function scrubFraction(tMs: number): number {
  const span = windowEndMs.value - props.event.startTime;
  if (span <= 0) return 0;
  return Math.min(Math.max((tMs - props.event.startTime) / span, 0), 1);
}

function nearestFrameIndex(tMs: number): number {
  let best = -1;
  let bestDistance = Infinity;
  for (const [index, frame] of frames.value.entries()) {
    const distance = Math.abs(frame.tick.tMs - tMs);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

function togglePlayback(): void {
  if (showPlayback.value) {
    const at = playheadMs.value;
    nvrController.stop();
    showPlayback.value = false;
    ended.value = false;
    const index = nearestFrameIndex(at);
    if (index >= 0 && index !== selectedIndex.value) select(index);
    return;
  }
  playheadMs.value = selected.value?.tick.tMs ?? props.event.startTime;
  showPlayback.value = true;
  ended.value = false;
  nvrController.play(playheadMs.value * 1000);
}

function togglePlay(): void {
  const mode = nvrController.mode.value;
  if (mode === 'play') {
    nvrController.pause();
    return;
  }
  if (ended.value) {
    ended.value = false;
    playheadMs.value = props.event.startTime;
    nvrController.play(playheadMs.value * 1000);
    return;
  }
  if (mode === 'pause') {
    nvrController.resume();
    return;
  }
  nvrController.play(playheadMs.value * 1000);
}

function jumpTo(tMs: number): void {
  playheadMs.value = tMs;
  ended.value = false;
  if (nvrController.mode.value === 'play') nvrController.seek(tMs * 1000);
  else nvrController.scrub(tMs * 1000, true);
}

function scrubPosition(e: PointerEvent): number {
  const rect = scrubRef.value!.getBoundingClientRect();
  const fraction = Math.min(Math.max((e.clientX - rect.left) / Math.max(rect.width, 1), 0), 1);
  return props.event.startTime + fraction * (windowEndMs.value - props.event.startTime);
}

function onScrubDown(e: PointerEvent): void {
  if (!scrubRef.value) return;
  scrubRef.value.setPointerCapture(e.pointerId);
  scrubbing.value = true;
  wasPlayingBeforeScrub = nvrController.mode.value === 'play';
  applyScrub(scrubPosition(e), true);
}

function onScrubMove(e: PointerEvent): void {
  if (!scrubbing.value) return;
  applyScrub(scrubPosition(e));
}

function onScrubUp(e: PointerEvent): void {
  if (!scrubbing.value) return;
  scrubbing.value = false;
  const at = scrubPosition(e);
  playheadMs.value = at;
  ended.value = false;
  if (wasPlayingBeforeScrub) nvrController.play(at * 1000);
  else nvrController.scrub(at * 1000, true);
}

function applyScrub(tMs: number, force = false): void {
  playheadMs.value = tMs;
  const now = performance.now();
  if (!force && now - lastScrubSent < SCRUB_INTERVAL_MS) return;
  lastScrubSent = now;
  nvrController.scrub(tMs * 1000, true);
}

async function exportBundle(): Promise<void> {
  if (bundleBusy.value) return;
  bundleBusy.value = true;
  try {
    const encoder = new TextEncoder();
    const ticks = await allTicks();
    const entries: ZipEntry[] = [];

    entries.push({
      name: 'event.json',
      data: encoder.encode(JSON.stringify({ camera: { id: props.camera._id, name: props.camera.name }, event: props.event }, null, 2)),
    });

    const lines = [JSON.stringify({ setup: trace.value?.config ?? null, exportedAt: Date.now() }), ...ticks.map((tick) => JSON.stringify({ tick }))];
    entries.push({ name: 'trace.jsonl', data: encoder.encode(`${lines.join('\n')}\n`) });

    const clip = await exportClip();
    if (clip) entries.push({ name: 'clip.mp4', data: clip });

    let rendered = 0;
    for (const [index, frame] of frames.value.entries()) {
      if (rendered >= BUNDLE_MAX_FRAMES) break;
      const tick = frame.tick;
      if (tick.world.length === 0 && !tick.attrs?.length && tick.detections.length === 0) continue;
      const picture = await fullFrame(index);
      if (!picture) continue;
      const canvas = document.createElement('canvas');
      drawPicture(canvas, picture, tick);
      const jpeg = await canvasToJpeg(canvas);
      if (!jpeg) continue;
      const status = frames.value[index]?.status ?? 'approx';
      entries.push({ name: `frames/${String(index).padStart(4, '0')}_${relativeSeconds(tick.tMs)}s_${status}.jpg`, data: jpeg });
      rendered++;
    }

    const blob = buildStoredZip(entries);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trace-${props.camera.name}-${props.event.id.slice(0, 8)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    log.error('Trace bundle failed:', error);
    toast.add({ severity: 'error', summary: t('views.recordings.trace.bundle_failed'), detail: extractErrorMessage(error), life: 5000 });
  } finally {
    bundleBusy.value = false;
  }
}

async function exportClip(): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const nvrPlugin = nvrPluginRef.value as { nvrExport: (...args: any[]) => Promise<{ url: string }> } | undefined;
  if (!nvrPlugin?.nvrExport || !props.event.endTime) return undefined;
  try {
    const result = await nvrPlugin.nvrExport(props.event.cameraId, props.event.startTime * 1000, props.event.endTime * 1000);
    const response = await fetch(result.url, { credentials: 'include' });
    if (!response.ok) return undefined;
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    log.warn('Clip export for the trace bundle failed:', error);
    return undefined;
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array<ArrayBuffer> | undefined> {
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => resolve(blob ? new Uint8Array(await blob.arrayBuffer()) : undefined), 'image/jpeg', 0.85);
  });
}

function updateHeaderActions(): void {
  if (!dialogRefProps.headerActions) return;
  dialogRefProps.headerActions.value =
    status.value === 'ready'
      ? [{ icon: DownloadIcon, tooltip: t('views.recordings.trace.bundle_hint'), onClick: () => void exportBundle(), loading: bundleBusy.value }]
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

watch(
  playerRef,
  (el, _, onCleanup) => {
    if (el) onCleanup(nvrController.claimContainer(el));
  },
  { immediate: true },
);

useIntervalFn(() => {
  if (!showPlayback.value || scrubbing.value || nvrController.mode.value === 'idle') return;
  const us = playheadUs(nvrController);
  if (us <= 0) return;
  const tMs = us / 1000;
  if (nvrController.mode.value === 'play' && tMs >= windowEndMs.value) {
    nvrController.pause();
    ended.value = true;
    playheadMs.value = windowEndMs.value;
    return;
  }
  playheadMs.value = Math.min(Math.max(tMs, props.event.startTime), windowEndMs.value);
}, 100);

watch(frames, (list) => {
  if (selectedIndex.value < 0 && list.length > 0) select(0);
  nextTick(() => {
    redrawThumbs();
    if (!stagePicture.value && !stageLoading.value && selected.value?.thumb) showStage(selectedIndex.value);
  });
});

watch(selectedIndex, (index) => {
  showStage(index);
  nextTick(scrollThumbIntoView);
  const tick = frames.value[index]?.tick;
  if (showPlayback.value && tick) jumpTo(tick.tMs);
});

watch([stagePicture, stageIsOwnFrame, stageCanvasRef, showZones], () => nextTick(drawStage));

watch(
  status,
  (value) => {
    if (value === 'ready') nextTick(loadVisible);
    updateHeaderActions();
  },
  { immediate: true },
);

watch(bundleBusy, updateHeaderActions);

onBeforeUnmount(() => {
  if (showPlayback.value) nvrController.stop();
});

onMounted(() => {
  load(props.event.cameraId, props.event.id);
});
</script>

<style scoped>
.stage {
  height: clamp(200px, 42vh, 480px);
  container-type: size;
}

.frame {
  width: min(100cqw, calc(100cqh * var(--ar-w) / var(--ar-h)));
  height: min(100cqh, calc(100cqw * var(--ar-h) / var(--ar-w)));
}

.control-bar-btn {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  flex-shrink: 0;
  border-radius: 6px !important;
  transition: background 0.15s ease !important;
}

.control-bar-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12) !important;
}

.scrub-knob {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
  border-radius: 9999px;
  background: #fff;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.3);
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

.tile-value {
  font-size: 1.125rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
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

.chip-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  flex-shrink: 0;
}

.strip {
  scrollbar-width: none;
}

.strip::-webkit-scrollbar {
  display: none;
}
</style>
