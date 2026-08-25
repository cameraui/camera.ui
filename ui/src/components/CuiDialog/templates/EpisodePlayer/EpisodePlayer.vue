<template>
  <div class="episode-player-container">
    <div ref="stageRef" class="relative w-full overflow-hidden bg-black" :style="{ aspectRatio: stageAspect }">
      <VueZoomable
        v-model:pan="panValue"
        v-model:zoom="zoomValue"
        :pan-enabled="zoomValue > 1"
        :enable-control-button="false"
        :dbl-click-enabled="false"
        :min-zoom="1"
        :max-zoom="MAX_ZOOM"
        :selector="`[data-zoomable-content='${zoomId}']`"
        zoom-origin="pointer"
        class="absolute inset-0"
        :class="{ 'zoom-constraining': isConstraining, 'zoom-dragging': dragging }"
        @panned="onZoomPan"
        @zoom="onZoomPan"
        @dblclick="resetZoom"
        @pointerdown="onDragStart"
        @touchstart="onDragStart"
      >
        <div :data-zoomable-content="zoomId" class="relative w-full h-full">
          <div v-for="id in memberCameraIds" v-show="id === visibleCameraId" :key="id" :ref="(el) => setStageEl(id, el as HTMLElement | null)" class="absolute inset-0" />
        </div>
      </VueZoomable>

      <div class="absolute inset-0 z-[3] bg-black pointer-events-none transition-opacity duration-300" :class="transitioning ? 'opacity-100' : 'opacity-0'" />

      <div v-if="showSpinner || transitioning" class="absolute inset-0 z-[3] flex items-center justify-center pointer-events-none">
        <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
      </div>

      <Transition name="fade-2">
        <div v-if="zoomMinimapStyle" class="zoom-minimap" :class="{ 'zoom-minimap-raised': showControl }">
          <div class="zoom-minimap-viewport" :style="zoomMinimapStyle" />
        </div>
      </Transition>

      <div class="absolute top-0 left-0 right-0 p-3 z-[3] flex items-center gap-2 pointer-events-none">
        <span class="text-sm font-semibold p-2 bg-black/60 rounded-xl text-white truncate">{{ activeCameraName }}</span>
        <span class="ml-auto text-sm font-medium p-2 bg-black/60 rounded-xl text-white tabular-nums shrink-0">{{ clockLabel }}</span>
      </div>

      <Transition name="fade-2">
        <div v-if="showControl" class="absolute bottom-0 inset-x-0 z-[5] dark-mode">
          <div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
          <div class="relative flex items-center gap-1 px-3 pb-2 pt-6">
            <div class="flex items-center gap-0.5">
              <Button fluid text severity="contrast" class="control-bar-btn" @click="jumpBlock(-1)">
                <template #icon>
                  <i-mdi:skip-previous class="w-[18px] h-[18px]" />
                </template>
              </Button>
              <Button fluid text severity="contrast" class="control-bar-btn" @click="togglePlay">
                <template #icon>
                  <i-basil:pause-solid v-if="isPlaying" class="w-[18px] h-[18px]" />
                  <i-basil:play-solid v-else class="w-[18px] h-[18px]" />
                </template>
              </Button>
              <Button fluid text severity="contrast" class="control-bar-btn" @click="jumpBlock(1)">
                <template #icon>
                  <i-mdi:skip-next class="w-[18px] h-[18px]" />
                </template>
              </Button>
            </div>

            <div class="flex-1" />

            <Button
              v-if="availableAngle || angleCameraId"
              v-tooltip.top="{ value: t('views.recordings.second_angle') }"
              fluid
              text
              severity="contrast"
              class="control-bar-btn"
              :class="{ 'angle-active': angleCameraId }"
              @click="toggleAngle"
            >
              <template #icon>
                <i-mdi:camera-flip-outline class="w-[18px] h-[18px]" />
              </template>
            </Button>

            <Button fluid text severity="contrast" class="control-bar-btn" @click="muted = !muted">
              <template #icon>
                <i-heroicons:speaker-wave-16-solid v-if="!muted" class="w-[18px] h-[18px]" />
                <i-heroicons:speaker-x-mark-16-solid v-else class="w-[18px] h-[18px]" />
              </template>
            </Button>
          </div>
        </div>
      </Transition>
    </div>

    <div class="px-3 pt-3 pb-2">
      <div
        ref="stripRef"
        class="relative h-[36px] rounded-lg bg-white/5 cursor-pointer select-none touch-none overflow-hidden"
        @pointerdown="onStripPointerDown"
        @pointermove="onStripPointerMove"
        @pointerup="onStripPointerUp"
        @pointercancel="onStripPointerUp"
      >
        <div
          v-for="(block, i) in blocks"
          :key="i"
          class="absolute top-[3px] bottom-[3px] rounded-[4px] flex items-center justify-center overflow-hidden pointer-events-none"
          :class="i === blockIndex ? 'bg-primary-500/60' : 'bg-primary-500/25'"
          :style="{ left: `${chips[i].left + 1}px`, width: `${Math.max(chips[i].width - 2, 2)}px` }"
        >
          <span v-if="chips[i].width > 26" class="text-[10px] font-medium text-white/90 truncate px-1.5">{{ cameraName(block.cameraId) }}</span>
        </div>
        <div class="absolute top-0 bottom-0 w-[2px] bg-white z-[2] pointer-events-none rounded-full" :style="{ left: `${playheadPx}px` }" />
      </div>
      <div class="flex justify-between mt-1 text-[10px] text-muted tabular-nums">
        <span>{{ boundLabel(firstBlockMs) }}</span>
        <span>{{ boundLabel(lastBlockMs) }}</span>
      </div>
    </div>

    <div v-if="episode.description?.description" class="w-full px-4 pb-3 flex gap-2 items-start">
      <i-tabler:sparkles class="w-4 h-4 shrink-0 mt-0.5 text-color" />
      <p class="flex-1 min-w-0 text-xs text-muted text-wrap">{{ episode.description.description }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { playheadUs, useMultiNvrPlayback } from '@camera.ui/nvr';
import VueZoomable from 'vue-zoomable';
import DownloadIcon from '~icons/tabler/download';

import { extractErrorMessage, randomLetter } from '@/common/utils.js';

import type { DialogRefProps } from '@/composables/useCuiDialog.js';
import type { EpisodePlayerProps } from './types.js';

interface TimelineBlock {
  cameraId: string;
  startMs: number;
  endMs: number;
  offsetMs: number;
}

const props = defineProps<EpisodePlayerProps>();

const log = useLogger();
const toast = useCuiToast();
const { t } = useI18n();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;
const { plugin: nvrPluginRef } = usePlugin('@camera.ui/camera-ui-nvr');

const BLOCK_TAIL_MS = 2000;
const BLOCK_HEAD_MS = 1500;
const BLOCK_GAP_MS = 10000;
const SLICE_MIN_MS = 4000;
const PRELOAD_AHEAD_MS = 4000;
const HANDOFF_WAIT_MS = 1200;
const TRANSITION_MAX_MS = 1500;
const PRELOAD_RESYNC_MS = 3000;

const memberCameraIds = [...new Set(props.episode.members.map((m) => m.cameraId))];
const angleBlocks = (props.episode.blocks ?? []).filter((block) => block.secondAngle);
const blocks = buildBlocks();
const totalMs = Math.max(
  blocks.reduce((sum, block) => sum + (block.endMs - block.startMs), 0),
  1,
);
const firstBlockMs = blocks[0]?.startMs ?? props.episode.startTime;
const lastBlockMs = blocks[blocks.length - 1]?.endMs ?? props.episode.endTime;

const stageRef = useTemplateRef('stageRef');
const stripRef = useTemplateRef('stripRef');
const blockIndex = ref(0);
const playheadMs = ref(firstBlockMs);
const angleCameraId = ref<string | null>(null);

const muted = ref(true);
const ended = ref(false);
const scrubbing = ref(false);
const panValue = ref({ x: 0, y: 0 });
const zoomValue = ref(1);
const lastZoom = ref(1);
const isConstraining = ref(false);

const isDownloading = ref(false);
const initialHover = ref(true);
const transitioning = ref(false);
const dragging = ref(false);

const stageSize = useElementSize(stageRef);
const isHovered = useElementHover(stageRef, { delayLeave: 1000 });
const stripWidth = useElementSize(stripRef).width;

const stageEls = new Map<string, HTMLElement>();
const claimReleases: (() => void)[] = [];
let playbackStarted = false;
let wasPlayingBeforeScrub = false;
let lastScrubSent = 0;
let handoffStartedAt = 0;
let transitionStartedAt = 0;
const preloadResynced = new Set<string>();
const MAX_ZOOM = 5;
const zoomId = randomLetter();

const currentBlock = computed(() => blocks[blockIndex.value]);
const activeCameraId = computed(() => currentBlock.value?.cameraId ?? memberCameraIds[0] ?? '');
const visibleCameraId = ref(activeCameraId.value);

const positionMs = computed(() => (currentBlock.value ? currentBlock.value.offsetMs + (playheadMs.value - currentBlock.value.startMs) : 0));

const availableAngle = computed(() => {
  const block = currentBlock.value;
  if (!block) return undefined;
  const t = playheadMs.value;
  return angleBlocks.find((angle) => angle.cameraId !== block.cameraId && angle.startMs <= t && t <= angle.endMs)?.cameraId;
});

const zoomMinimapStyle = computed(() => {
  const zoom = zoomValue.value;
  const width = stageSize.width.value;
  const height = stageSize.height.value;
  if (zoom <= 1 || !width || !height) return null;

  const pan = panValue.value;
  const scaledWidth = width * zoom;
  const scaledHeight = height * zoom;

  return {
    width: `${(width / scaledWidth) * 100}%`,
    height: `${(height / scaledHeight) * 100}%`,
    left: `${((1 - width / scaledWidth) / 2) * 100 - (pan.x / scaledWidth) * 100}%`,
    top: `${((1 - height / scaledHeight) / 2) * 100 - (pan.y / scaledHeight) * 100}%`,
  };
});

const preloadCameraId = computed(() => {
  const block = currentBlock.value;
  const next = blocks[blockIndex.value + 1];
  if (!block || !next || next.cameraId === activeCameraId.value) return undefined;
  return block.endMs - playheadMs.value <= PRELOAD_AHEAD_MS ? next.cameraId : undefined;
});

const activeIds = computed(() => {
  const ids = new Set([activeCameraId.value, visibleCameraId.value]);
  if (preloadCameraId.value) ids.add(preloadCameraId.value);
  if (angleCameraId.value) ids.add(angleCameraId.value);
  return [...ids];
});

const { master, controllers } = useMultiNvrPlayback(ref(memberCameraIds), { activeIds, sourceRole: 'auto' });

const isPlaying = computed(() => master.mode.value === 'play');
const showControl = computed(() => isHovered.value || initialHover.value);
const showSpinner = computed(() => !scrubbing.value && (master.loading.value || master.mode.value === 'idle'));

const stageAspect = computed(() => {
  return props.cameraById.get(visibleCameraId.value)?.interfaceSettings.aspectRatio.replace(':', '/') ?? '16/9';
});

const activeCameraName = computed(() => cameraName(visibleCameraId.value));

const clockLabel = computed(() => {
  return new Date(playheadMs.value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
});

const chips = computed(() => {
  const width = stripWidth.value;
  const durations = blocks.map((block) => block.endMs - block.startMs);
  const px = new Array<number>(blocks.length).fill(0);

  if (width > 0 && blocks.length > 0) {
    const floor = Math.min(14, width / blocks.length);
    let flexible = blocks.map((_, i) => i);
    for (;;) {
      const room = width - floor * (blocks.length - flexible.length);
      const total = flexible.reduce((sum, i) => sum + durations[i], 0);
      const under = flexible.filter((i) => (durations[i] / total) * room < floor);
      if (total <= 0 || flexible.length === 0) {
        for (const i of flexible) px[i] = room / Math.max(flexible.length, 1);
        break;
      }
      if (under.length === 0) {
        for (const i of flexible) px[i] = (durations[i] / total) * room;
        break;
      }
      for (const i of under) px[i] = floor;
      flexible = flexible.filter((i) => !under.includes(i));
    }
    for (let i = 0; i < px.length; i++) if (px[i] === 0) px[i] = floor;
  }

  let left = 0;
  return px.map((w) => {
    const chip = { left, width: w };
    left += w;
    return chip;
  });
});

const playheadPx = computed(() => {
  const block = currentBlock.value;
  const chip = chips.value[blockIndex.value];
  if (!block || !chip) return 0;
  const frac = (playheadMs.value - block.startMs) / Math.max(block.endMs - block.startMs, 1);
  return chip.left + clamp(frac, 0, 1) * chip.width;
});

function resetZoom(): void {
  lastZoom.value = 1;
  zoomValue.value = 1;
  panValue.value = { x: 0, y: 0 };
}

function onDragStart(event: PointerEvent | TouchEvent): void {
  if (dragging.value) return;
  const isTouch = event.type === 'touchstart' || (event as PointerEvent).pointerType !== 'mouse';
  if (!isTouch && zoomValue.value <= 1) return;

  dragging.value = true;
  const end = (): void => {
    dragging.value = false;
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    window.removeEventListener('touchend', end);
    window.removeEventListener('touchcancel', end);
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  window.addEventListener('touchend', end);
  window.addEventListener('touchcancel', end);
}

function constrainPan(pan: { x: number; y: number }, zoom: number): { x: number; y: number } {
  const maxX = Math.max(0, (stageSize.width.value * zoom - stageSize.width.value) / 2);
  const maxY = Math.max(0, (stageSize.height.value * zoom - stageSize.height.value) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, pan.x)),
    y: Math.max(-maxY, Math.min(maxY, pan.y)),
  };
}

function onZoomPan(event: { zoom: number; pan: { x: number; y: number } }): void {
  if (isConstraining.value) return;

  let zoom = Math.max(1, Math.min(event.zoom, MAX_ZOOM));
  if (zoom < 1.02) zoom = 1;
  const clamped = Math.abs(event.zoom - zoom) > 0.001;

  if (zoom <= 1) {
    lastZoom.value = 1;
    if (panValue.value.x !== 0 || panValue.value.y !== 0 || zoomValue.value !== 1) {
      isConstraining.value = true;
      resetZoom();
      requestAnimationFrame(() => setTimeout(() => (isConstraining.value = false), 150));
    }
    return;
  }

  const pan = { x: event.pan.x, y: event.pan.y };
  if (zoom < lastZoom.value && lastZoom.value > 1) {
    const scale = (zoom - 1) / (lastZoom.value - 1);
    pan.x = panValue.value.x * scale;
    pan.y = panValue.value.y * scale;
  }
  lastZoom.value = zoom;

  const constrained = constrainPan(pan, zoom);
  if (clamped) {
    isConstraining.value = true;
    zoomValue.value = zoom;
    panValue.value = constrained;
    requestAnimationFrame(() => setTimeout(() => (isConstraining.value = false), 100));
  } else {
    panValue.value = constrained;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function cameraName(id: string): string {
  return props.cameraById.get(id)?.name ?? id;
}

function buildBlocks(): TimelineBlock[] {
  const told = props.episode.blocks?.filter((block) => !block.secondAngle && block.endMs > block.startMs) ?? [];
  const source = told.length ? told.map((block) => ({ cameraId: block.cameraId, startMs: block.startMs, endMs: block.endMs })) : blocksFromMembers();

  let offsetMs = 0;
  return source.map((block, i) => {
    const before = i > 0 ? block.startMs - source[i - 1].endMs : Number.POSITIVE_INFINITY;
    const after = i + 1 < source.length ? source[i + 1].startMs - block.endMs : Number.POSITIVE_INFINITY;
    const startMs = block.startMs - Math.min(BLOCK_HEAD_MS, Math.max(before / 2, 0));
    const endMs = block.endMs + Math.min(BLOCK_TAIL_MS, Math.max(after / 2, 0));
    const entry = { cameraId: block.cameraId, startMs, endMs, offsetMs };
    offsetMs += endMs - startMs;
    return entry;
  });
}

function blocksFromMembers(): { cameraId: string; startMs: number; endMs: number }[] {
  const byCamera = new Map<string, [number, number][]>();
  for (const member of props.episode.members) {
    const spans: [number, number][] = member.segmentSpans?.length
      ? member.segmentSpans.map((span) => [span.firstSeen, span.lastSeen])
      : [[member.firstSeen, member.lastSeen]];
    byCamera.set(member.cameraId, [...(byCamera.get(member.cameraId) ?? []), ...spans]);
  }

  const built: { cameraId: string; startMs: number; endMs: number }[] = [];
  for (const [cameraId, spans] of byCamera) {
    spans.sort((a, b) => a[0] - b[0]);
    let current = { cameraId, startMs: spans[0][0], endMs: spans[0][1] };
    for (const [firstSeen, lastSeen] of spans.slice(1)) {
      if (firstSeen - current.endMs <= BLOCK_GAP_MS) {
        current.endMs = Math.max(current.endMs, lastSeen);
        continue;
      }
      built.push(current);
      current = { cameraId, startMs: firstSeen, endMs: lastSeen };
    }
    built.push(current);
  }
  built.sort((a, b) => a.startMs - b.startMs || a.cameraId.localeCompare(b.cameraId));
  return interleave(built);
}

function interleave(source: { cameraId: string; startMs: number; endMs: number }[]): { cameraId: string; startMs: number; endMs: number }[] {
  if (source.length < 2) return source;

  const cuts = [...new Set(source.flatMap((block) => [block.startMs, block.endMs]))].sort((a, b) => a - b);
  const told: { cameraId: string; startMs: number; endMs: number }[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const startMs = cuts[i];
    const endMs = cuts[i + 1];
    const at = (startMs + endMs) / 2;
    const holder = source.reduce<{ cameraId: string; startMs: number; endMs: number } | undefined>(
      (best, block) => (block.startMs <= at && at <= block.endMs && (!best || block.startMs > best.startMs) ? block : best),
      undefined,
    );
    if (!holder) continue;
    const last = told[told.length - 1];
    if (last && last.cameraId === holder.cameraId && last.endMs === startMs) {
      last.endMs = endMs;
      continue;
    }
    told.push({ cameraId: holder.cameraId, startMs, endMs });
  }
  return mergeShortSlices(told);
}

function mergeShortSlices(told: { cameraId: string; startMs: number; endMs: number }[]): { cameraId: string; startMs: number; endMs: number }[] {
  for (;;) {
    const counts = new Map<string, number>();
    for (const block of told) counts.set(block.cameraId, (counts.get(block.cameraId) ?? 0) + 1);

    const short = told.findIndex((block) => block.endMs - block.startMs < SLICE_MIN_MS && (counts.get(block.cameraId) ?? 0) > 1);
    if (short < 0) break;
    if (short > 0 && told[short - 1].endMs === told[short].startMs) told[short - 1].endMs = told[short].endMs;
    told.splice(short, 1);
  }

  const joined: { cameraId: string; startMs: number; endMs: number }[] = [];
  for (const block of told) {
    const last = joined[joined.length - 1];
    if (last && last.cameraId === block.cameraId && last.endMs === block.startMs) {
      last.endMs = block.endMs;
      continue;
    }
    joined.push(block);
  }
  return joined;
}

function blockAt(posMs: number): number {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (posMs >= blocks[i].offsetMs) return i;
  }
  return 0;
}

function boundLabel(tMs: number): string {
  return new Date(tMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function setStageEl(id: string, el: HTMLElement | null): void {
  if (el) stageEls.set(id, el);
  else stageEls.delete(id);
}

function setPosition(posMs: number): void {
  const bounded = clamp(posMs, 0, totalMs);
  const index = blockAt(bounded);
  const block = blocks[index];
  if (!block) return;
  blockIndex.value = index;
  playheadMs.value = clamp(block.startMs + (bounded - block.offsetMs), block.startMs, block.endMs);
}

function ctrlReady(id: string): boolean {
  const ctrl = controllers.value.get(id);
  if (!ctrl) return true;
  const tsMs = playheadUs(ctrl) / 1000;
  return !ctrl.loading.value && tsMs > 0 && Math.abs(tsMs - playheadMs.value) < 6000;
}

function beginHandoffTransition(): void {
  transitioning.value = true;
  transitionStartedAt = performance.now();
}

function trySyncVisibleCamera(): void {
  const target = angleCameraId.value ?? activeCameraId.value;
  if (visibleCameraId.value !== target) {
    if (!ctrlReady(target) && performance.now() - handoffStartedAt <= HANDOFF_WAIT_MS) return;
    visibleCameraId.value = target;
  }
  if (transitioning.value && (ctrlReady(visibleCameraId.value) || performance.now() - transitionStartedAt > TRANSITION_MAX_MS)) {
    transitioning.value = false;
  }
}

function toggleAngle(): void {
  if (angleCameraId.value) {
    angleCameraId.value = null;
  } else {
    const angle = availableAngle.value;
    if (!angle) return;
    angleCameraId.value = angle;
    const ctrl = controllers.value.get(angle);
    if (ctrl && master.mode.value === 'play') ctrl.play(playheadMs.value * 1000);
  }
  handoffStartedAt = performance.now();
  beginHandoffTransition();
  trySyncVisibleCamera();
}

function seekTo(posMs: number, forcePlay = false): void {
  setPosition(posMs);
  ended.value = false;
  if (forcePlay || master.mode.value === 'play') {
    master.play(playheadMs.value * 1000);
  } else {
    master.scrub(playheadMs.value * 1000, true);
  }
}

function togglePlay(): void {
  const mode = master.mode.value;
  if (mode === 'play') {
    master.pause();
    return;
  }
  if (ended.value) {
    seekTo(0, true);
    return;
  }
  if (mode === 'pause') {
    master.resume();
    return;
  }
  seekTo(positionMs.value, true);
}

function jumpBlock(dir: 1 | -1): void {
  const block = currentBlock.value;
  if (!block) return;
  beginHandoffTransition();

  if (dir === -1 && playheadMs.value - block.startMs > 1500) {
    seekTo(block.offsetMs);
    return;
  }
  const target = blocks[blockIndex.value + dir];
  if (target) seekTo(target.offsetMs);
}

function stripPositionFromEvent(e: PointerEvent): number {
  const rect = stripRef.value!.getBoundingClientRect();
  const x = clamp(e.clientX - rect.left, 0, rect.width);
  for (let i = chips.value.length - 1; i >= 0; i--) {
    const chip = chips.value[i];
    if (x < chip.left && i > 0) continue;
    const frac = clamp((x - chip.left) / Math.max(chip.width, 1), 0, 1);
    return blocks[i].offsetMs + frac * (blocks[i].endMs - blocks[i].startMs);
  }
  return 0;
}

function onStripPointerDown(e: PointerEvent): void {
  if (!stripRef.value) return;
  stripRef.value.setPointerCapture(e.pointerId);
  scrubbing.value = true;
  wasPlayingBeforeScrub = master.mode.value === 'play';
  applyScrub(stripPositionFromEvent(e), true);
}

function onStripPointerMove(e: PointerEvent): void {
  if (!scrubbing.value) return;
  applyScrub(stripPositionFromEvent(e));
}

function onStripPointerUp(e: PointerEvent): void {
  if (!scrubbing.value) return;
  scrubbing.value = false;
  setPosition(stripPositionFromEvent(e));
  ended.value = false;
  if (wasPlayingBeforeScrub) master.play(playheadMs.value * 1000);
  else master.scrub(playheadMs.value * 1000, true);
}

function applyScrub(posMs: number, force = false): void {
  setPosition(posMs);
  const now = performance.now();
  if (!force && now - lastScrubSent < 120) return;
  lastScrubSent = now;
  master.scrub(playheadMs.value * 1000, true);
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

function resolveGoTo(): string | undefined {
  const camera = props.cameraById.get(activeCameraId.value);
  if (!camera) return undefined;
  return `/cameras/${camera.name}?startTs=${Math.floor(playheadMs.value)}`;
}

function resyncPreload(): void {
  const preload = preloadCameraId.value;
  for (const id of preloadResynced) {
    if (id !== preload) preloadResynced.delete(id);
  }
  if (!preload || master.mode.value !== 'play' || preloadResynced.has(preload)) return;
  const ctrl = controllers.value.get(preload);
  if (!ctrl?.isActive.value || ctrl.loading.value) return;
  const ctrlMs = playheadUs(ctrl) / 1000;
  if (ctrlMs <= 0 || Math.abs(ctrlMs - playheadMs.value) <= PRELOAD_RESYNC_MS) return;
  preloadResynced.add(preload);
  ctrl.play(playheadMs.value * 1000);
}

watch(visibleCameraId, resetZoom);

watchEffect(() => {
  for (const [id, ctrl] of controllers.value) {
    ctrl.muted.value = muted.value || id !== visibleCameraId.value;
  }
});

watch(availableAngle, (next) => {
  if (angleCameraId.value && next !== angleCameraId.value) {
    angleCameraId.value = null;
    trySyncVisibleCamera();
  }
});

watch(activeCameraId, (next) => {
  angleCameraId.value = null;
  handoffStartedAt = performance.now();
  const ctrl = controllers.value.get(next);
  if (ctrl?.isActive.value) {
    if (ctrlReady(next)) {
      visibleCameraId.value = next;
      return;
    }
    if (master.mode.value === 'play') ctrl.play(playheadMs.value * 1000);
  }
  trySyncVisibleCamera();
});

watch(
  nvrPluginRef,
  (proxy) => {
    if (!proxy || playbackStarted) return;
    playbackStarted = true;
    master.play(playheadMs.value * 1000);
  },
  { immediate: true },
);

watch(
  [nvrPluginRef, isDownloading],
  ([proxy]) => {
    if (!dialogRefProps.headerActions) return;
    if (!proxy) {
      dialogRefProps.headerActions.value = [];
      return;
    }
    dialogRefProps.headerActions.value = [{ icon: DownloadIcon, tooltip: t('views.recordings.download'), onClick: handleDownload, loading: isDownloading.value }];
  },
  { immediate: true },
);

useIntervalFn(() => {
  trySyncVisibleCamera();
  resyncPreload();
  if (scrubbing.value || master.mode.value === 'idle') return;
  const us = playheadUs(master);
  if (us <= 0) return;
  const tMs = us / 1000;
  const block = currentBlock.value;
  if (!block) return;

  if (master.mode.value === 'play' && tMs >= block.endMs) {
    const next = blocks[blockIndex.value + 1];
    beginHandoffTransition();
    if (!next) {
      ended.value = true;
      setPosition(0);
      master.scrub(playheadMs.value * 1000, true);
      return;
    }
    blockIndex.value += 1;
    playheadMs.value = next.startMs;
    master.seek(next.startMs * 1000);
    return;
  }
  playheadMs.value = clamp(tMs, block.startMs, block.endMs);
}, 250);

onMounted(() => {
  for (const [id, ctrl] of controllers.value) {
    const el = stageEls.get(id);
    if (el) claimReleases.push(ctrl.claimContainer(el));
  }
  setTimeout(() => (initialHover.value = false), 1500);
});

onUnmounted(() => {
  master.stop();
  for (const release of claimReleases) release();
});

defineExpose({
  resolveGoTo,
});
</script>

<style scoped>
.episode-player-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  contain: inline-size;
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

.angle-active {
  background: rgba(255, 255, 255, 0.18) !important;
}

.zoom-constraining :deep(> *) {
  transition: transform 0.15s ease-out !important;
}

.zoom-dragging :deep(> *) {
  transition: none !important;
}

.zoom-minimap {
  position: absolute;
  bottom: 10px;
  right: 10px;
  width: 80px;
  aspect-ratio: v-bind(stageAspect);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.5);
  z-index: 6;
  pointer-events: none;
  overflow: hidden;
  transition: bottom 0.2s ease;
}

.zoom-minimap-raised {
  bottom: 50px;
}

.zoom-minimap-viewport {
  position: absolute;
  border: 1.5px solid rgba(255, 255, 255, 0.7);
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.12);
}
</style>
