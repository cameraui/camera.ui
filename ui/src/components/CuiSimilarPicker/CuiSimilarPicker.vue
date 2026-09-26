<template>
  <div
    class="similar-picker absolute inset-0 overflow-hidden pointer-events-auto"
    :class="{ 'cursor-crosshair': canPick }"
    @pointerdown.stop
    @mousedown.stop
    @touchstart.stop
    @dblclick.stop
    @click.stop="onClick"
  >
    <div class="similar-scrim" :class="{ 'opacity-0': object }" />

    <div v-if="clickAt && !object" class="similar-pulse" :style="{ left: `${clickAt.x * 100}%`, top: `${clickAt.y * 100}%` }" />

    <canvas v-if="object?.mask" ref="outlineCanvas" class="similar-outline" />

    <div v-if="object" class="similar-box" :class="{ 'similar-box-outlined': object.mask }" :style="boxStyle(object.box)">
      <span class="similar-box-label" :class="{ 'similar-box-label-below': object.box.y < 0.1 }">
        {{ status === 'ready' ? frameObjectText(object, t) : t('components.similar.reading') }}
      </span>
    </div>

    <Transition name="similar-bar">
      <div v-if="barVisible" class="similar-bar">
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

import type { BoundingBox } from '@camera.ui/sdk';
import type { CuiSimilarPickerEmits, CuiSimilarPickerProps } from './types.js';

const props = defineProps<CuiSimilarPickerProps>();

const emit = defineEmits<CuiSimilarPickerEmits>();

const { t } = useI18n();
const { status, object, load, pickAt, clear } = useFrameSearch(() => ({
  id: props.camera._id,
  assignments: props.camera.assignments,
  confidences: props.camera.detectionSettings?.object?.confidences,
  faceConfidence: props.camera.detectionSettings?.face?.confidence,
  faceSensitivity: props.camera.detectionSettings?.face?.matchSensitivity,
  plate: props.camera.detectionSettings?.licensePlate,
}));

const BAR_SHOWN_MS = 3500;

const outlineCanvas = useTemplateRef<HTMLCanvasElement>('outlineCanvas');
const clickAt = shallowRef<{ x: number; y: number }>();
const barVisible = ref(true);
let barTimer: ReturnType<typeof setTimeout> | undefined;

const busy = computed(() => !props.frame || status.value === 'scanning' || status.value === 'reading');

const canPick = computed(() => Boolean(props.frame) && !busy.value && status.value !== 'noDetector' && status.value !== 'failed');

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

async function onClick(event: MouseEvent): Promise<void> {
  if (!canPick.value) return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const point = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  clickAt.value = point;
  const found = await pickAt(point.x, point.y);
  if (found?.query) emit('pick', { ...found, query: found.query });
}

watch(
  () => props.frame,
  (frame) => {
    clickAt.value = undefined;
    if (frame) load(frame);
    else clear();
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

onKeyStroke('Escape', () => emit('close'));

onBeforeUnmount(() => clearTimeout(barTimer));
</script>

<style scoped>
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
  border-radius: 6px;
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
  border-radius: 6px;
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

.similar-bar-enter-active,
.similar-bar-leave-active {
  transition: opacity 400ms ease;
}

.similar-bar-enter-from,
.similar-bar-leave-to {
  opacity: 0;
}
</style>
