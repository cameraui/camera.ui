<template>
  <div
    class="similar-picker absolute inset-0 overflow-hidden pointer-events-auto"
    :class="{ 'cursor-crosshair': canPick }"
    @pointerdown.stop="onPointerDown"
    @mousedown.stop
    @touchstart="onTouchStart"
    @dblclick.stop
    @click.stop="onClick"
    @pointermove="onPointerMove"
    @pointerleave="hovered = -1"
  >
    <img v-if="still && stillUrl" :src="stillUrl" alt="" draggable="false" class="similar-still" />

    <div class="similar-scrim" :class="{ 'opacity-0': object }" />

    <div v-for="(found, index) in objects" :key="index" class="similar-found" :class="{ 'similar-found-hover': index === hovered }" :style="boxStyle(found.box)" />

    <div v-if="clickAt && !object" class="similar-pulse" :style="{ left: `${clickAt.x * 100}%`, top: `${clickAt.y * 100}%` }" />

    <canvas v-if="object?.mask" ref="outlineCanvas" class="similar-outline" />

    <div v-if="object" class="similar-box" :class="{ 'similar-box-outlined': object.mask }" :style="boxStyle(object.box)">
      <span class="similar-box-label" :class="{ 'similar-box-label-below': object.box.y < 0.1 }">
        {{ status === 'ready' ? frameObjectText(object, t) : t('components.similar.reading') }}
      </span>
    </div>

    <button v-if="continuable" type="button" class="similar-continue" @click.stop="emit('continue')">
      <i-basil:play-solid class="w-3.5 h-3.5 shrink-0" />
      <span class="truncate">{{ t('components.similar.continue') }}</span>
    </button>

    <Transition name="similar-bar">
      <div v-if="barVisible" class="similar-bar" :class="{ 'similar-bar-low': continuable }">
        <i-svg-spinners:ring-resize v-if="busy" class="w-4 h-4 shrink-0" />
        <i-tabler:zoom-scan v-else class="w-4 h-4 shrink-0" />
        <span class="text-sm truncate">{{ statusText }}</span>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { useFrameSearch } from '@camera.ui/nvr';

import { frameObjectText } from '@/common/eventLabels.js';
import { drawOutline } from '@/utils/objectMask.js';
import { TOUCH_SLOP_PX } from './types.js';

import type { BoundingBox } from '@camera.ui/sdk';
import type { CuiSimilarPickerEmits, CuiSimilarPickerProps, SimilarPickPoint } from './types.js';

const props = defineProps<CuiSimilarPickerProps>();

const emit = defineEmits<CuiSimilarPickerEmits>();

const { t } = useI18n();
const { status, object, objects, load, detectAll, pickAt, clear } = useFrameSearch(() => ({
  id: props.camera._id,
  assignments: props.camera.assignments,
  confidences: props.camera.detectionSettings?.object?.confidences,
  faceConfidence: props.camera.detectionSettings?.face?.confidence,
  faceSensitivity: props.camera.detectionSettings?.face?.matchSensitivity,
  plate: props.camera.detectionSettings?.licensePlate,
}));

const BAR_SHOWN_MS = 3500;

const outlineCanvas = useTemplateRef<HTMLCanvasElement>('outlineCanvas');
const clickAt = shallowRef<SimilarPickPoint>();
const stillUrl = shallowRef<string>();
const barVisible = ref(true);
const detecting = ref(false);
const hovered = ref(-1);
let barTimer: ReturnType<typeof setTimeout> | undefined;
let pointPicked = false;
let pressed = false;
let gesture = false;
let scans = 0;

const reading = computed(() => status.value === 'scanning' || status.value === 'reading');

const busy = computed(() => !props.frame || detecting.value || reading.value);

const canPick = computed(() => Boolean(props.frame) && !reading.value && status.value !== 'noDetector' && status.value !== 'failed');

const statusText = computed(() => {
  switch (status.value) {
    case 'scanning':
      return t('components.similar.scanning');
    case 'reading':
      return t('components.similar.reading');
    case 'nothing':
      return t('components.similar.no_objects');
    case 'noDetector':
      return t('components.similar.no_detector');
    case 'failed':
      return t('components.similar.failed');
    case 'ready':
      if (object.value?.query) return t('components.similar.searching');
      return object.value?.label === 'vehicle' ? t('components.similar.no_vehicle_notice') : t('components.similar.no_face_notice');
    default:
      return t('components.similar.pick_hint');
  }
});

function boxStyle({ x, y, width, height }: BoundingBox): Record<string, string> {
  return { left: `${x * 100}%`, top: `${y * 100}%`, width: `${width * 100}%`, height: `${height * 100}%` };
}

function paintOutline(): void {
  const canvas = outlineCanvas.value;
  const mask = object.value?.mask;
  if (canvas && mask) drawOutline(canvas, mask, getComputedStyle(canvas).color);
}

function pointOf(event: MouseEvent, rect: DOMRect): SimilarPickPoint {
  return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
}

function objectAt(point: SimilarPickPoint): number {
  let best = -1;
  let bestArea = Infinity;
  objects.value.forEach(({ box }, index) => {
    const area = box.width * box.height;
    if (point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height && area < bestArea) {
      best = index;
      bestArea = area;
    }
  });
  return best;
}

function nearestObject(point: SimilarPickPoint, rect: DOMRect): SimilarPickPoint {
  if (objectAt(point) >= 0) return point;
  let near: SimilarPickPoint | undefined;
  let nearest = TOUCH_SLOP_PX;
  for (const { box } of objects.value) {
    const dx = Math.max(box.x - point.x, 0, point.x - box.x - box.width) * rect.width;
    const dy = Math.max(box.y - point.y, 0, point.y - box.y - box.height) * rect.height;
    if (Math.hypot(dx, dy) > nearest) continue;
    nearest = Math.hypot(dx, dy);
    near = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  return near ?? point;
}

function onPointerDown(): void {
  pressed = true;
}

function onTouchStart(event: TouchEvent): void {
  // two fingers zoom the picture, one picks
  if (event.touches.length > 1) {
    gesture = true;
    return;
  }
  gesture = false;
  event.stopPropagation();
}

function onPointerMove(event: PointerEvent): void {
  if (event.pointerType === 'touch') return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const index = objectAt(pointOf(event, rect));
  if (index !== hovered.value) hovered.value = index;
}

async function onClick(event: MouseEvent): Promise<void> {
  // the press that froze the picture can end in a click up here
  const tap = pressed && !gesture;
  pressed = false;
  gesture = false;
  if (!tap) return;
  if (!canPick.value) return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const point = pointOf(event, rect);
  await pickPoint((event as PointerEvent).pointerType === 'touch' ? nearestObject(point, rect) : point);
}

async function findAll(): Promise<void> {
  const scan = ++scans;
  detecting.value = true;
  try {
    await detectAll();
  } finally {
    if (scan === scans) detecting.value = false;
  }
}

async function pickPoint(point: SimilarPickPoint): Promise<void> {
  clickAt.value = point;
  const found = await pickAt(point.x, point.y);
  if (found?.query) emit('pick', { ...found, query: found.query });
}

watch(
  () => props.frame,
  async (frame) => {
    clickAt.value = undefined;
    hovered.value = -1;
    if (!frame) {
      clear();
      return;
    }
    await load(frame);
    if (frame !== props.frame) return;
    findAll();
    // the click that opened the picker picks on its first picture only
    if (!props.point || pointPicked) return;
    pointPicked = true;
    if (status.value === 'waiting') pickPoint(props.point);
  },
  { immediate: true },
);

watch(
  () => (props.still ? props.frame : undefined),
  (frame) => {
    const previous = stillUrl.value;
    stillUrl.value = frame ? URL.createObjectURL(frame) : undefined;
    if (previous) URL.revokeObjectURL(previous);
  },
  { immediate: true },
);

watch([outlineCanvas, () => object.value?.mask], paintOutline, { flush: 'post' });

watch(
  [statusText, busy],
  ([, working]) => {
    clearTimeout(barTimer);
    barVisible.value = true;
    if (!working && status.value !== 'noDetector' && status.value !== 'failed') barTimer = setTimeout(() => (barVisible.value = false), BAR_SHOWN_MS);
  },
  { immediate: true },
);

useResizeObserver(outlineCanvas, paintOutline);

onBeforeUnmount(() => {
  clearTimeout(barTimer);
  if (stillUrl.value) URL.revokeObjectURL(stillUrl.value);
});
</script>

<style scoped>
.similar-still {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.similar-scrim {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 0.25);
  transition: opacity 150ms ease;
  pointer-events: none;
}

.similar-pulse {
  position: absolute;
  width: 44px;
  height: 44px;
  margin: -22px 0 0 -22px;
  border: 2px solid var(--p-primary-color);
  border-radius: 999px;
  animation: similar-pulse 1s ease-out infinite;
  pointer-events: none;
}

.similar-found {
  position: absolute;
  border: 1px solid rgb(255 255 255 / 0.55);
  border-radius: 8px;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.25);
  transition:
    border-color 120ms ease,
    background 120ms ease;
  pointer-events: none;
}

.similar-found-hover {
  border: 2px solid var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 12%, transparent);
}

@keyframes similar-pulse {
  from {
    transform: scale(0.4);
    opacity: 1;
  }
  to {
    transform: scale(1.4);
    opacity: 0;
  }
}

.similar-box {
  position: absolute;
  border: 2px solid var(--p-primary-color);
  border-radius: 8px;
  box-shadow:
    0 0 0 9999px rgb(0 0 0 / 0.5),
    0 0 18px 2px color-mix(in srgb, var(--p-primary-color) 70%, transparent);
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
  pointer-events: none;
}

.similar-box-outlined {
  border-color: transparent;
  box-shadow: none;
}

.similar-outline {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  color: var(--p-primary-color);
  pointer-events: none;
  animation: similar-fade-in 150ms ease-out;
}

@keyframes similar-fade-in {
  from {
    opacity: 0;
  }
}

.similar-box-label {
  position: absolute;
  left: -2px;
  bottom: calc(100% + 6px);
  max-width: 220px;
  padding: 2px 8px;
  border-radius: 8px;
  background: rgb(0 0 0 / 0.75);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.similar-box-label-below {
  bottom: auto;
  top: calc(100% + 6px);
}

.similar-bar {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 24px);
  padding: 6px 12px;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.7);
  color: #fff;
  pointer-events: none;
}

.similar-bar-low {
  top: 52px;
}

.similar-continue {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: calc(100% - 24px);
  padding: 6px 14px;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.7);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
}

.similar-continue:hover {
  background: rgb(0 0 0 / 0.85);
}

.similar-bar-enter-active,
.similar-bar-leave-active {
  transition: opacity 400ms ease;
}

.similar-bar-enter-from,
.similar-bar-leave-to {
  opacity: 0;
}
</style>
